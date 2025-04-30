# Argus Kubernetes Deployment

This directory contains Kubernetes manifests for deploying the Argus API.

## Prerequisites

- Docker
- kubectl
- A Kubernetes cluster
- Access to container registry (if using a private registry)

## Building the Docker Image

1. From the project root, build the Docker image:

```bash
docker build -t argus:latest .
```

2. Optionally tag and push to a container registry:

```bash
docker tag argus:latest your-registry/argus:latest
docker push your-registry/argus:latest
```

## Configuration

1. Copy the `k8s/config.json.template` file to `k8s/config.json` and modify the
   configuration settings:

```bash
# Copy the template
cp k8s/config.json.template k8s/config.json

# Modify the config.json file
vim k8s/config.json

# Create the ConfigMap
npm run k8s:config
```

2. For sensitive information, consider using Kubernetes Secrets:

```bash
kubectl create secret generic argus-secrets \
  --from-literal=accountsJwtSecret=your-jwt-secret \
  --from-literal=DB_ACCOUNTS_PASSWORD=your-accounts-db-password \
  --from-literal=DB_DATA_PASSWORD=your-data-db-password
```

## Deployment

1. Apply the Kubernetes manifests:

```bash
kubectl apply -f k8s/configmap-file.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

2. Check the status of your deployment:

```bash
kubectl get pods -l app=argus
kubectl get services -l app=argus
```
