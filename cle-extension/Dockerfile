FROM closure
RUN sudo apt update
RUN sudo apt install -y curl default-jre
RUN curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
RUN sudo apt update
RUN sudo apt install -y nodejs
RUN sudo python3 -m pip install zmq mypy inflection 