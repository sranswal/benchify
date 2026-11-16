FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 BENCHIFY_ENV=production
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --system --user-group --no-create-home benchify
COPY benchify ./benchify
USER benchify
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn benchify.main:app --host 0.0.0.0 --port \"${PORT:-8000}\" --workers 1 --timeout-graceful-shutdown 25 --no-access-log"]
