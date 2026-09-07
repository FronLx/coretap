FROM node:24-slim AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client/ ./
RUN npm run build

FROM node:24-slim AS server
WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev
COPY server/ ./
RUN mkdir -p /app/client
COPY --from=client /app/client/dist /app/client/dist

ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.js"]