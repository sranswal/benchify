FROM python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 BENCHIFY_ENV=production
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --system --user-group --no-create-home benchify
COPY benchify ./benchify
COPY start.sh ./start.sh
USER benchify
EXPOSE 8000
CMD ["/bin/sh", "/app/start.sh"]
