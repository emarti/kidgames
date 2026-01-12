# Simple, GUI-capable Python dev container (works with pygame + X11)
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /workspace

# System deps for pygame + typical X11 rendering in containers
RUN apt-get update && apt-get install -y --no-install-recommends \
    # pygame / SDL deps
    libsdl2-2.0-0 \
    libsdl2-image-2.0-0 \
    libsdl2-mixer-2.0-0 \
    libsdl2-ttf-2.0-0 \
    libgl1 \
    libglib2.0-0 \
    mesa-utils \
    libgl1-mesa-dri \
    libglx-mesa0 \
    xvfb \
    x11-utils \
    python3-tk \
    # handy basics
    git \
    bash \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install -r requirements.txt


# Default: interactive dev shell; override in compose/run script
CMD ["/bin/bash"]
