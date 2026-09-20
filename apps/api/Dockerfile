# syntax=docker/dockerfile:1
FROM golang:1.23-alpine AS build
WORKDIR /src
ENV GOTOOLCHAIN=auto
RUN apk add --no-cache git ca-certificates
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go test ./...
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/calyx-api ./cmd/server
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/calyx-migrate ./cmd/migrate

FROM alpine:3.20
RUN apk add --no-cache ca-certificates wget
WORKDIR /app
COPY --from=build /out/calyx-api /app/calyx-api
COPY --from=build /out/calyx-migrate /app/calyx-migrate
ENV ADDR=:14000
EXPOSE 14000
USER nobody
ENTRYPOINT ["/app/calyx-api"]
