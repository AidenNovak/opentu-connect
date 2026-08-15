# The release pipeline must pass NODE_IMAGE as a Node 20 image pinned by digest.
# The compose overlay accepts only a content-addressed final gateway image.
ARG NODE_IMAGE
FROM ${NODE_IMAGE}

WORKDIR /app
ENV NODE_ENV=production

COPY --chown=node:node server.mjs ./server.mjs

USER node
EXPOSE 8787
CMD ["node", "server.mjs"]
