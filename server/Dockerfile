FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1000 user
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# baixa os modelos do homr durante a montagem (o servidor já sobe pronto)
RUN python -c "from homr.main import download_weights; download_weights(False, False, False)" && chmod -R a+rwX /usr/local/lib/python3.12/site-packages/homr
COPY app.py .
USER user
ENV OMP_NUM_THREADS=2
EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
