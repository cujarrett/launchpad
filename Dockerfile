# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
FROM node:26-alpine@sha256:7ed4edf2b680417bf06d3f465de09bb113f877ff265b15f72a27a4c6fb76fb04 AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production image - nginx serves the built SPA.
# The Spa Crossplane composition mounts its own nginx config over
# /etc/nginx/conf.d/default.conf, so only the static files matter here.
FROM nginx:1.31-alpine@sha256:785835ea65db4bba6f021acc0f3be91b0fef76a53fe41f8588c6698d2aed0606
# The base image lags behind Alpine security fixes.
# Updating here clears those CVEs without waiting for nginx to rebuild.
RUN apk upgrade --no-cache
COPY --from=build /app/dist/launchpad/browser /usr/share/nginx/html
EXPOSE 80
