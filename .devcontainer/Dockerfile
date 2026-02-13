FROM docker.io/library/fedora:43

RUN dnf update -y && dnf install -y \
    git \
    docker \
    awscli

# Install Node
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
RUN . /root/.nvm/nvm.sh && nvm install 24

# Install dagger
RUN cd /usr/local; curl -L https://dl.dagger.io/dagger/install.sh | sh