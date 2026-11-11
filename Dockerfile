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
# The platform base image already carries Alpine's security fixes.
FROM ghcr.io/cujarrett/base-spa:nginx1.31-alpine@sha256:a5e096d54c04b6543c25e45b26334e3a2f8533b571bf50e0dd02b66fb7c4e84a
COPY --from=build /app/dist/launchpad/browser /usr/share/nginx/html
EXPOSE 80
