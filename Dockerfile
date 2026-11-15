FROM node:22-alpine
WORKDIR /app
COPY package.json server.js channels.json ./
ENV PORT=7000
EXPOSE 7000
USER node
CMD ["node", "server.js"]
