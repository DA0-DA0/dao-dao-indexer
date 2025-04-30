# DAO DAO Indexer Kubernetes Deployment

This directory contains Kubernetes manifests for deploying the DAO DAO Indexer API.

## Prerequisites

- Docker
- kubectl
- A Kubernetes cluster
- Access to container registry (if using a private registry)

## Building the Docker Image

1. From the project root, build the Docker image:

```bash
docker build -t dao-dao-indexer:latest .
```

2. Optionally tag and push to a container registry:

```bash
docker tag dao-dao-indexer:latest your-registry/dao-dao-indexer:latest
docker push your-registry/dao-dao-indexer:latest
```

## Configuration

1. Modify the `configmap.yaml` file to contain your specific configuration settings:

```bash
# Edit the ConfigMap with your specific values
kubectl edit -f k8s/configmap.yaml
```

2. For sensitive information, consider using Kubernetes Secrets:

```bash
kubectl create secret generic dao-dao-indexer-secrets \
  --from-literal=accountsJwtSecret=your-jwt-secret \
  --from-literal=DB_ACCOUNTS_PASSWORD=your-accounts-db-password \
  --from-literal=DB_DATA_PASSWORD=your-data-db-password
```

## Deployment

1. Apply the Kubernetes manifests:

```bash
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
```

2. Check the status of your deployment:

```bash
kubectl get pods -l app=dao-dao-indexer
kubectl get services -l app=dao-dao-indexer
```
