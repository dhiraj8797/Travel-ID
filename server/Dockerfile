FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY index.js ./
ENV NODE_ENV=production
EXPOSE 8787
CMD ["node", "index.js"]
