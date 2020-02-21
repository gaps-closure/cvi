#!/bin/bash

BUILD="$(pwd)/build"
PACKAGE_DIR="packages"
LLVM_DEB="LLVM-10.0.0svn-Linux.deb"
CODE_DEB="code_1.40.2-1574694120_amd64.deb"
PRE_DOWNLOADED_DEBS=($LLVM_DEB $CODE_DEB)
PY_MODULES=(clang lark-parser pydot decorator)
DEB_PACKAGES=(xdot)

usage_exit() {
  [[ -n "$1" ]] && echo $1
  echo "Usage: $0 [ -d ] \\"
  echo "-h        Help"
  echo "-c        Clean up"
  echo "-d        Dry run"
  exit 1
}

handle_opts() {
  local OPTIND
  while getopts "dc" options; do
    case "${options}" in
      c) CLEAN=1                ;;
      d) DRY_RUN="--dry-run"    ;;
      h) usage_exit             ;;
      :) usage_exit "Error: -${OPTARG} requires an argument." ;;
      *) usage_exit             ;;
    esac
  done
}

install_deb() {
  message=$1
  PKG=$2

  if [ ! -f $PKG ]; then
      echo "*** package not found: $PKG"
      if [[ $DRY_RUN ]]; then
          return
      else
          exit 1
      fi
  fi

  echo "Installing $message"
  sudo dpkg $DRY_RUN -i $PKG
}    

install_llvm () {
  install_deb "Qualatype LLVM" "$PACKAGE_DIR/$LLVM_DEB"
}

install_vscode () {
  CODE=$(code -h)
  if [ $? -eq 0 ]; then
      echo "VS CODE is installed"
      if ! [[ $DRY_RUN ]]; then
          return
      fi
  fi

  install_deb "Qualatype Visual Studio Code" "$PACKAGE_DIR/$CODE_DEB"
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
      sudo apt install $DRY_RUN nodejs
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

build_pdg () {
  echo "Building PDG"

  TMP_DIR=$(pwd)
  cd pdg
  make
  #mv build/libpdg.so $BUILD
  cd $TMP_DIR
}

clean_pdg () {
  echo "Cleaning PDG"

  TMP_DIR=$(pwd)
  cd pdg
  make clean
  cd $TMP_DIR
}

build_quala () {
  echo "Bulding Quala"

  TMP_DIR=$(pwd)
  cd quala/examples/tainting
  make

  cd ../nullness
  make
  cd $TMP_DIR
}

clean_quala () {
  echo "Cleaning Quala"

  TMP_DIR=$(pwd)
  cd quala/examples/tainting
  make clean

  cd ../nullness
  make clean
  cd $TMP_DIR
}

build_partitioner () {
  echo "Bulding partitioner"

  TMP_DIR=$(pwd)
  cd partitioner/src
  make

  cd $TMP_DIR
}

check_py_module () {
    for m in "${PY_MODULES[@]}"
    do
        pip3 list | grep $m
        if [ $? -eq 0 ]; then
            echo "$m is already installed"
        else
            echo "$m not installed; installing it"
            sudo pip3 install $m
        fi
    done
}

check_packages () {
    for m in "${DEB_PACKAGES[@]}"
    do
        apt list | grep -w $m
        if [ $? -eq 0 ]; then
            echo "$m is already installed"
        else
            echo "$m not installed; installing it"
            sudo apt-get install -y $m
        fi
    done
}

download_packages () {
    rm -rf packages
    mkdir -p packages
    
    for m in "${PRE_DOWNLOADED_DEBS[@]}"
    do
        echo "Downloading $m"
    done
}

handle_opts "$@"

echo "BUILD=${BUILD}"

if [[ $CLEAN ]]; then
    rm -rf $BUILD cle
    clean_pdg
    clean_quala
    clean_partitioner
else
    if [ ! "$(ls -A pdg)" ]; then
        git submodule init
        git submodule update
    fi

    check_py_module
    check_packages
    download_packages

    rm -rf cle
    mkdir -p cle
    cd cle
    ln -s ../cle-preprocessor preprocessor
    cd ..

    mkdir -p $BUILD

    install_llvm
    install_vscode
    install_vsce
    build_vscode_extensions
    build_pdg
    build_quala
    build_partitioner
fi
