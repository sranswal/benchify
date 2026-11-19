FROM maximhq/bifrost:v2.5.1@sha256:5ec9873acaf1687556b6e4dd854b92b539d9debf87a5a683b66338648b84d3c8
USER root
RUN apk add --no-cache su-exec=0.3-r0
COPY deploy/bifrost.config.json /etc/benchify/config.json
COPY deploy/bifrost-start.sh /etc/benchify/check-start.sh
COPY deploy/render/bifrost-start.sh /etc/benchify/render-start.sh
RUN chmod 755 /etc/benchify/*.sh
ENV APP_DIR=/app/data APP_PORT=8080 APP_HOST=0.0.0.0 LOG_LEVEL=info LOG_STYLE=json GOMEMLIMIT=384MiB
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=140s --retries=4 CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
ENTRYPOINT ["/bin/sh", "/etc/benchify/render-start.sh"]
