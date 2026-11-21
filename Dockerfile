FROM node:22-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories && apk add --no-cache font-noto-cjk
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
ENV NODE_ENV=production PORT=3000 PDF_FONT=/usr/share/fonts/otf/noto/NotoSansCJK-Regular.ttc
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server/index.js"]
