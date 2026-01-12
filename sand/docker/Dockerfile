# Use Python 3.12-slim or Python 3.11-slim, etc.
FROM python:3.13-slim-trixie

# Prevent interactive prompts during build
ENV DEBIAN_FRONTEND=noninteractive PIP_DISABLE_PIP_VERSION_CHECK=1 PIP_NO_CACHE_DIR=1
 
# -----------------------------------------------------------------------------
# Install system dependencies (build-essential, python3-dev/distutils for building some packages)
# -----------------------------------------------------------------------------
RUN apt-get update && apt-get install -y --no-install-recommends \
    # build-essential \
    # curl \
    # git \
    # libffi-dev \
    # libssl-dev \
    # pkg-config \
    # tcl-dev \
    # tk-dev \
    python3-tk \
    # libx11-6 \
    # x11-apps \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# Supervisor is used to run both ssh and jupyter
# COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
# Copy requirements into the image so Docker can cache them
COPY requirements.txt requirements.txt

# Upgrade pip and install Python requirements (tkinter is provided by the OS package above)
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

CMD ["/bin/bash"]