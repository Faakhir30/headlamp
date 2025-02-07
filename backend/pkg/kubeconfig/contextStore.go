package kubeconfig

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode"

	"github.com/headlamp-k8s/headlamp/backend/pkg/cache"
	"github.com/headlamp-k8s/headlamp/backend/pkg/logger"
)

// ContextStore is an interface for storing and retrieving contexts.
type ContextStore interface {
	AddContext(headlampContext *Context) error
	GetContexts() ([]*Context, error)
	GetContext(name string) (*Context, error)
	RemoveContext(name string) error
	AddContextWithKeyAndTTL(headlampContext *Context, key string, ttl time.Duration) error
	UpdateTTL(key string, ttl time.Duration) error
}

type contextStore struct {
	cache cache.Cache[*Context]
}

// NewContextStore creates a new ContextStore.
func NewContextStore() ContextStore {
	cache := cache.New[*Context]()

	return &contextStore{
		cache: cache,
	}
}

// AddContext adds a context to the store.
func (c *contextStore) AddContext(headlampContext *Context) error {
	name := headlampContext.Name

	if headlampContext.KubeContext != nil && headlampContext.KubeContext.Extensions["headlamp_info"] != nil {
		info := headlampContext.KubeContext.Extensions["headlamp_info"]
		// Convert the runtime.Unknown object to a byte slice
		unknownBytes, err := json.Marshal(info)
		if err != nil {
			return err
		}

		// Now, decode the byte slice into your desired struct
		var customObj CustomObject

		err = json.Unmarshal(unknownBytes, &customObj)
		if err != nil {
			return err
		}

		// If the custom name is set, use it as the context name
		if customObj.CustomName != "" {
			name = customObj.CustomName
		}
	}
	name = MakeDNSFriendly(name)
	headlampContext.Name = name
	
	return c.cache.Set(context.Background(), name, headlampContext)
}

// GetContexts returns all contexts in the store.
func (c *contextStore) GetContexts() ([]*Context, error) {
	contexts := []*Context{}

	contextMap, err := c.cache.GetAll(context.Background(), nil)
	if err != nil {
		return nil, err
	}

	for _, ctx := range contextMap {
		contexts = append(contexts, ctx)
	}

	return contexts, nil
}

// GetContext returns a context from the store.
func (c *contextStore) GetContext(name string) (*Context, error) {
	context, err := c.cache.Get(context.Background(), name)
	if err != nil {
		return nil, err
	}

	return context, nil
}

// RemoveContext removes a context from the store.
func (c *contextStore) RemoveContext(name string) error {
	return c.cache.Delete(context.Background(), name)
}

// AddContextWithTTL adds a context to the store with a ttl.
func (c *contextStore) AddContextWithKeyAndTTL(headlampContext *Context, key string, ttl time.Duration) error {
	headlampContext.Name = MakeDNSFriendly(headlampContext.Name)
	return c.cache.SetWithTTL(context.Background(), key, headlampContext, ttl)
}

// UpdateTTL updates the ttl of a context.
func (c *contextStore) UpdateTTL(key string, ttl time.Duration) error {
	return c.cache.UpdateTTL(context.Background(), key, ttl)
}


// MakeDNSFriendly converts a string to a URL and DNS-friendly format.
// It follows RFC 1123 label name rules and handles special characters from various cloud providers:
// - AWS EKS (ARN format: arn:aws:eks:region:account-id:cluster/cluster-name)
// - GKE (format: gke_project_zone_cluster)
// - AKS (format: cluster-resourcegroup-subscription)
// The output string will be:
// - Maximum 63 characters (DNS label limit)
// - Only contain: lowercase letters, numbers, and hyphens
// - Start and end with alphanumeric characters
// - No consecutive hyphens
func MakeDNSFriendly(name string) string {
	if name == "" {
		logger.Log(logger.LevelInfo, map[string]string{"action": "makeDNSFriendly", "input": "empty"}, nil,
			"Empty context name provided, using default")
		return "unnamed-context"
	}

	// Handle common cloud provider formats
	if strings.HasPrefix(name, "gke_") && strings.Count(name, "_") >= 3 {
		// Preserve GKE format as-is if it's valid
		if matched, _ := regexp.MatchString("^gke_[a-z0-9-]+_[a-z0-9-]+_[a-z0-9-]+$", name); matched {
			return name
		}
	}

	// Handle common cloud provider separators and essential characters only
	replacements := map[string]string{
		"/":  "-",      // Path separator (AWS ARN)
		" ":  "__",      // Spaces (human readability)
		":":  "-",      // ARN separator (AWS)
		"=":  "-eq-",   // IAM path character
		"+":  "-plus-", // IAM path character
		",":  "-",      // IAM path character
		"@":  "-at-",   // IAM path character
		"\\": "-",      // Windows path separator
		"(":  "-",      // AKS allowed character
		")":  "-",      // AKS allowed character
		"*":  "-star-", // Wildcard character in ARNs
		".":  "-",      // Convert dots to hyphens
	}

	result := name
	originalLength := len(result)

	// Apply character replacements
	for old, new := range replacements {
		result = strings.ReplaceAll(result, old, new)
	}

	// Convert to lowercase and replace any remaining unsafe characters
	result = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z':
			return r
		case r >= 'A' && r <= 'Z':
			return unicode.ToLower(r)
		case r >= '0' && r <= '9':
			return r
		case r == '-':
			return r
		default:
			return '-'
		}
	}, result)

	// Remove consecutive hyphens
	for strings.Contains(result, "--") {
		result = strings.ReplaceAll(result, "--", "-")
	}

	// Trim hyphens from start and end
	result = strings.Trim(result, "-")

	// Ensure the name starts and ends with alphanumeric characters
	if result == "" || !isAlphanumeric(rune(result[0])) {
		result = "x-" + result
	}
	if !isAlphanumeric(rune(result[len(result)-1])) {
		result = result + "-x"
	}

	// Ensure the name doesn't exceed DNS label length
	if len(result) > MaxDNSLabelLength {
		// Try to preserve meaningful parts while staying within limits
		if strings.Contains(result, "-") {
			parts := strings.Split(result, "-")
			result = truncateParts(parts, MaxDNSLabelLength)
		} else {
			result = result[:MaxDNSLabelLength]
		}
		logger.Log(logger.LevelInfo, map[string]string{
			"action":         "makeDNSFriendly",
			"originalLength": fmt.Sprintf("%d", originalLength),
			"truncatedTo":    fmt.Sprintf("%d", len(result)),
		}, nil, "Context name truncated to meet DNS label length limit")
	}

	// If the name is empty after cleaning, provide a fallback
	if result == "" {
		logger.Log(logger.LevelInfo, map[string]string{
			"action": "makeDNSFriendly",
			"input":  name,
		}, nil, "Context name was empty after cleaning, using default")
		return "unnamed-context"
	}

	// Log if significant changes were made
	if result != name {
		logger.Log(logger.LevelInfo, map[string]string{
			"action":     "makeDNSFriendly",
			"original":   name,
			"converted":  result,
			"characters": fmt.Sprintf("%d -> %d", len(name), len(result)),
		}, nil, "Context name was modified to be DNS friendly")
	}

	return result
}

// isAlphanumeric returns true if the rune is a letter or digit
func isAlphanumeric(r rune) bool {
	return (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9')
}

// truncateParts attempts to preserve meaningful parts of a name while staying within length limit
func truncateParts(parts []string, maxLength int) string {
	if len(parts) == 0 {
		return ""
	}

	// Calculate target length per part
	targetLen := (maxLength - (len(parts) - 1)) / len(parts) // account for hyphens

	// Ensure minimum length of 1 for each part
	if targetLen < 1 {
		// If we can't fit all parts, take first and last parts
		return fmt.Sprintf("%s-%s", parts[0][:1], parts[len(parts)-1][:1])
	}

	// Truncate each part to target length
	for i := range parts {
		if len(parts[i]) > targetLen {
			parts[i] = parts[i][:targetLen]
		}
	}

	return strings.Join(parts, "-")
}
