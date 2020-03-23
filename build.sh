#!/bin/bash

BUILD="$(pwd)/build"

usage_exit() {
  [[ -n "$1" ]] && echo $1
  echo "Usage: $0 [ -cdh ] "
  echo "-h        Help"
  echo "-c        Clean up"
  echo "-d        Dry run"
  exit 1
}

handle_opts() {
  local OPTIND
  while getopts "cdh" options; do
    case "${options}" in
      c) CLEAN=1                ;;
      d) DRY_RUN="--dry-run"    ;;
      h) usage_exit             ;;
      :) usage_exit "Error: -${OPTARG} requires an argument." ;;
      *) usage_exit             ;;
    esac
  done
}

install_vscode () {
  CODE=$(code -h)
  if [ $? -eq 0 ]; then
      echo "VS CODE is installed"
      if ! [[ $DRY_RUN ]]; then
          return
      fi
  fi

  VSCODE_LIST="/etc/apt/sources.list.d/vscode.list"
  CONTETNS="deb [arch=amd64] http://packages.microsoft.com/repos/vscode stable main"

  if [ -f $VSCODE_LIST ]; then
      echo "$VSCODE_LIST already exists."
  else
      sudo bash -c 'echo deb [arch=amd64] http://packages.microsoft.com/repos/vscode stable main > /etc/apt/sources.list.d/vscode.list'
  fi

  echo "Importing package signing key"
  curl https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > microsoft.gpg
  sudo mv microsoft.gpg /etc/apt/trusted.gpg.d/microsoft.gpg

  echo "Installing Visual Studio Code"
  sudo apt-get update
  sudo apt-get install code
}

install_vsce () {
  VSCE=$(vsce -h)
  if [ $? -eq 0 ]; then
      echo "VSCE is installed"
      if ! [[ $DRY_RUN ]]; then
          return
      fi
  fi
 
  NODE=$(nodejs -v)
  if [ $? -eq 0 ]; then
      echo "Node.js $NODE is installed"
  else
      echo "Installing Node.js"
      # TODO: check if Ubuntu 19.10 can use this. sudo apt install $DRY_RUN nodejs
      curl -sL https://deb.nodesource.com/setup_12.x | sudo -E bash -
      sudo apt-get install -y nodejs
      sudo apt-get update
      sudo apt-get install npm
      sudo npm install npm --global
  fi
  
  echo "Installing Visual Studio Code Extension Manager (vsce)"
  if ! [[ $DRY_RUN ]]; then
      sudo npm install -g vsce
  fi
}

build_vscode_extensions () {
  VSCE=$(vsce -h)
  if [ ! $? -eq 0 ]; then
      echo "VSCE is NOT installed or not on the PATH"
      exit
  fi

  TMP_DIR=$(pwd)
  echo $TMP_DIR
  echo "Bulding CLE-themes"
  cd cle-themes
  vsce package
  mv CLE-themes-0.0.1.vsix $BUILD
  
  echo "Bulding CLE-highlighter"
  cd ../cle-highlighter
  vsce package
  mv CLE-Highlighter-0.0.1.vsix $BUILD
  
  cd $TMP_DIR
}

handle_opts "$@"

echo "BUILD=${BUILD}"

if [[ $CLEAN ]]; then
    rm -rf $BUILD
else
    mkdir -p $BUILD

    install_vscode
    install_vsce
    build_vscode_extensions
fi
