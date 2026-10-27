FROM node:20-alpine
WORKDIR /app
COPY package.json server.js ./
ENV PORT=3100
EXPOSE 3100
USER node
CMD ["node", "server.js"]
