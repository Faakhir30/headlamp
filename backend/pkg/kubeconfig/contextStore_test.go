package kubeconfig_test

import (
	"testing"
	"time"
	"strings"

	"github.com/stretchr/testify/assert"
	"github.com/headlamp-k8s/headlamp/backend/pkg/cache"
	"github.com/headlamp-k8s/headlamp/backend/pkg/kubeconfig"
	"github.com/stretchr/testify/require"
	"k8s.io/client-go/tools/clientcmd/api"
)

func TestContextStore(t *testing.T) {
	store := kubeconfig.NewContextStore()

	// Test AddContext

	err := store.AddContext(&kubeconfig.Context{Name: "test"})
	require.NoError(t, err)

	// Add another context
	err = store.AddContext(&kubeconfig.Context{Name: "test2"})
	require.NoError(t, err)

	// Test GetContexts
	contexts, err := store.GetContexts()
	require.NoError(t, err)
	require.Equal(t, 2, len(contexts))

	// Test GetContext
	_, err = store.GetContext("non-existent-context")
	require.Error(t, err)

	context, err := store.GetContext("test")
	require.NoError(t, err)
	require.Equal(t, "test", context.Name)

	// Test RemoveContext
	err = store.RemoveContext("test")
	require.NoError(t, err)

	_, err = store.GetContext("test")
	require.Error(t, err)
	require.Equal(t, cache.ErrNotFound, err)

	// Add context with key and ttl
	err = store.AddContextWithKeyAndTTL(&kubeconfig.Context{Name: "testwithttl"}, "testwithttl", 2*time.Second)
	require.NoError(t, err)

	// Test GetContext
	value, err := store.GetContext("testwithttl")
	require.NoError(t, err)
	require.Equal(t, "testwithttl", value.Name)

	// Update ttl
	err = store.UpdateTTL("testwithttl", 2*time.Second)
	require.NoError(t, err)

	// Test GetContext after updating ttl
	value, err = store.GetContext("testwithttl")
	require.NoError(t, err)
	require.Equal(t, "testwithttl", value.Name)

	// sleep for 5 seconds and check ttlkey is present or not
	time.Sleep(5 * time.Second)

	// Test GetContext
	_, err = store.GetContext("testwithttl")
	require.Error(t, err)
	require.Equal(t, cache.ErrNotFound, err)
}

func TestMakeDNSFriendly(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		// Cloud provider formats
		{
			name:     "AWS EKS ARN",
			input:    "arn:aws:eks:us-west-2:123456789012:cluster/production-cluster",
			expected: "arn-aws-eks-us-west-2-123456789012-cluster-production-cluster",
		},
		{
			name:     "AWS EKS ARN with wildcard",
			input:    "arn:aws:eks:*:123456789012:cluster/*",
			expected: "arn-aws-eks-star-123456789012-cluster-star",
		},
		{
			name:     "GKE format",
			input:    "gke_my-project_us-central1-a_my-cluster",
			expected: "gke_my-project_us-central1-a_my-cluster", // Should preserve valid GKE format
		},
		{
			name:     "Invalid GKE format",
			input:    "gke_my-project_zone",
			expected: "gke-my-project-zone",
		},
		{
			name:     "AKS format",
			input:    "my-cluster-my-group-(prod)-12345",
			expected: "my-cluster-my-group-prod-12345",
		},
		// IAM path characters
		{
			name:     "IAM path characters",
			input:    "user/path+name=value,group@domain",
			expected: "user-path-plus-name-eq-value-group-at-domain",
		},
		// Common separators
		{
			name:     "Spaces and dots",
			input:    "my cluster.name",
			expected: "my-cluster-name",
		},
		{
			name:     "Multiple slashes",
			input:    "cluster///name////path",
			expected: "cluster-name-path",
		},
		{
			name:     "Windows path",
			input:    "cluster\\name\\path",
			expected: "cluster-name-path",
		},
		// Edge cases
		{
			name:     "Empty string",
			input:    "",
			expected: "unnamed-context",
		},
		{
			name:     "Very long name",
			input:    strings.Repeat("a", kubeconfig.MaxDNSLabelLength + 1),
			expected: strings.Repeat("a", kubeconfig.MaxDNSLabelLength),
		},
		{
			name:     "Unicode characters",
			input:    "cluster-测试-test",
			expected: "cluster-test",
		},
		{
			name:     "Leading and trailing hyphens",
			input:    "-cluster.name-",
			expected: "cluster-name",
		},
		{
			name:     "Multiple consecutive separators",
			input:    "cluster...name___test",
			expected: "cluster-name-test",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := kubeconfig.MakeDNSFriendly(tt.input)
			assert.Equal(t, tt.expected, result,
				"MakeDNSFriendly(%q) = %q, want %q",
				tt.input, result, tt.expected)
		})
	}
}

func TestMakeDNSFriendlyEdgeCases(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		// Length handling
		{
			name:     "Exactly max length",
			input:    strings.Repeat("a", kubeconfig.MaxDNSLabelLength),
			expected: strings.Repeat("a", kubeconfig.MaxDNSLabelLength),
		},
		{
			name:     "One over max length",
			input:    strings.Repeat("a", kubeconfig.MaxDNSLabelLength+1),
			expected: strings.Repeat("a", kubeconfig.MaxDNSLabelLength),
		},
		{
			name:     "Long name with hyphens",
			input:    strings.Repeat("a-", 31), // Will result in 62 chars
			expected: strings.Repeat("a-", 31)[:kubeconfig.MaxDNSLabelLength - 2],
		},
		// Cloud provider edge cases
		{
			name:     "GKE with invalid characters",
			input:    "gke_my@project_us-central1-a_my-cluster",
			expected: "gke-my-at-project-us-central1-a-my-cluster",
		},
		{
			name:     "AKS with special chars",
			input:    "my-cluster_(prod.test)@123",
			expected: "my-cluster-prod-test-at-123",
		},
		// DNS compliance cases
		{
			name:     "Start with number",
			input:    "123cluster",
			expected: "123cluster",
		},
		{
			name:     "All numeric",
			input:    "12345",
			expected: "12345",
		},
		{
			name:     "Mixed case",
			input:    "MyCluster",
			expected: "mycluster",
		},
		{
			name:     "With dots",
			input:    "cluster.name.test",
			expected: "cluster-name-test",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := kubeconfig.MakeDNSFriendly(tt.input)
			assert.Equal(t, tt.expected, result,
				"MakeDNSFriendly(%q) = %q, want %q",
				tt.input, result, tt.expected)

			// Additional validation for all results
			assert.LessOrEqual(t, len(result), kubeconfig.MaxDNSLabelLength,
				"Result length should not exceed MaxDNSLabelLength")
			
			// Validate result follows DNS label rules
			assert.Regexp(t, "^[a-z0-9][a-z0-9-]*[a-z0-9]$", result,
				"Result should match DNS label format")
			
			// Check no consecutive hyphens
			assert.NotContains(t, result, "--",
				"Result should not contain consecutive hyphens")
		})
	}
}

func TestContextNameValidation(t *testing.T) {
	// Create a test context store
	store := kubeconfig.NewContextStore()

	tests := []struct {
		name        string
		contextName string
		}{
		{
			name:        "Valid simple name",
			contextName: "test-cluster",
		},
		{
			name:        "Valid complex name",
			contextName: "arn-aws-eks-us-west-2-123456789012-cluster",
		},
		{
			name:        "Too long name",
			contextName: strings.Repeat("a", kubeconfig.MaxDNSLabelLength+1),
		},
		{
			name:        "Empty name",
			contextName: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := &kubeconfig.Context{
				Name: tt.contextName,
				KubeContext: &api.Context{
					Cluster:  "test-cluster",
					AuthInfo: "test-user",
				},
				Cluster: &api.Cluster{
					Server: "https://test-server",
				},
				AuthInfo: &api.AuthInfo{},
			}

			err := store.AddContext(ctx)
			assert.NoError(t, err)
			// Verify stored context
			storedCtx, err := store.GetContext(kubeconfig.MakeDNSFriendly(tt.contextName))
			assert.NoError(t, err)
			assert.NotNil(t, storedCtx)
			// Verify name was properly transformed
			assert.Equal(t, kubeconfig.MakeDNSFriendly(tt.contextName), storedCtx.Name)
		})
	}
}
