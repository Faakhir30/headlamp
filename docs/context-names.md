# Context Name Handling in Headlamp

This document describes how Headlamp handles Kubernetes context names, including validation, transformation, and display.

## Specifications

### DNS Label Requirements (RFC 1123)
- Maximum length: 63 characters
- Allowed characters: lowercase letters (a-z), numbers (0-9), and hyphens (-)
- Must start and end with alphanumeric characters
- Must not contain consecutive hyphens

### Cloud Provider Formats

#### AWS EKS
- Format: `arn:aws:eks:region:account-id:cluster/cluster-name`
- Special characters: `:`, `/`, `*` (in wildcards)
- Example: `arn:aws:eks:us-west-2:123456789012:cluster/production-cluster`

#### Google Kubernetes Engine (GKE)
- Format: `gke_project_zone_cluster`
- Uses underscores as separators
- Example: `gke_my-project_us-central1-a_my-cluster`

#### Azure Kubernetes Service (AKS)
- Format: `{cluster-name}-{resource-group-name}-{subscription-id}`
- Allows letters, numbers, underscores, hyphens, parentheses, and periods
- Example: `my-cluster-my-group-(prod)-12345`

## Implementation

### Backend (`MakeDNSFriendly`)
The backend implements strict DNS label compliance while preserving readability:

1. Character Replacements:
   - Converts uppercase to lowercase
   - Replaces special characters with meaningful alternatives
   - Handles cloud provider-specific formats

2. Length Handling:
   - Enforces 63-character limit
   - Smart truncation preserving meaningful parts
   - Adds fallback for empty names

3. Logging:
   - Tracks name transformations
   - Logs truncations and modifications
   - Provides debugging information

### Frontend Validation
The frontend provides real-time feedback:

1. Input Validation:
   - Length checks
   - Character validation
   - Format verification

2. User Feedback:
   - Error messages for invalid names
   - Preview of transformed names
   - Visual indicators for validation state

## Testing

### Manual Test Cases
Test the following context names:

1. Cloud Provider Formats:
   ```
   arn:aws:eks:us-west-2:123456789012:cluster/production-cluster
   arn:aws:eks:*:123456789012:cluster/*
   gke_my-project_us-central1-a_my-cluster
   my-cluster-my-group-(prod)-12345
   ```

2. Special Characters:
   ```
   test/cluster+name=value,group.test@domain
   cluster with spaces
   cluster///multiple////slashes
   cluster:name@domain+extra%20space
   cluster-测试-test
   ```

3. Edge Cases:
   ```
   # Empty string
   # Very long name (>63 chars)
   # Only special characters
   # Leading/trailing special chars
   ```

## Best Practices

1. Context Name Creation:
   - Use lowercase alphanumeric characters
   - Avoid special characters when possible
   - Keep names concise and meaningful

2. Error Handling:
   - Validate names early
   - Provide clear error messages
   - Handle transformations transparently

3. User Experience:
   - Show original and transformed names
   - Explain validation rules
   - Provide immediate feedback

## Related Documentation

- [Kubernetes API Conventions](https://github.com/kubernetes/community/blob/master/contributors/devel/sig-architecture/api-conventions.md#metadata)
- [AWS ARN Format](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_identifiers.html#identifiers-arns)
- [Azure Resource Naming](https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/resource-name-rules) 