FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.js ./
ENV OTTERSNAP_API_KEY=""
CMD ["node", "index.js"]
