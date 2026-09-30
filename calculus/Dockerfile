# Adaptive calculus textbook: browser app (python -m adaptcalc serve).
FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 HOST=0.0.0.0 ADAPTCALC_DATA=/data

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# Fetch the OpenStax chapter + figures, fonts and Typst packages into the image,
# so the app starts without downloading anything.
RUN python -m adaptcalc warm

EXPOSE 8000
CMD ["python", "-m", "adaptcalc", "serve"]
