FROM docker.io/library/fedora:39

RUN dnf update -y && dnf install -y \
    git \
    docker \
    awscli

# Install Node
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
RUN . /root/.nvm/nvm.sh && nvm install 18

# Install dagger
RUN cd /usr/local; curl -L https://dl.dagger.io/dagger/install.sh | sh