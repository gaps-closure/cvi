# Closure Visual Interface (CVI)
This repository hosts the open source components of CVI. The `master` branch contains the most recent public release software while `develop` contains bleeding-edge updates and work-in-progress features for use by beta testers and early adopters.

This repository is maintained by Perspecta Labs.

## Contents
- [Build](#build)
- [Installing VS Code Extensions](#installing-vs-code-extensions)
- [Syntax Highlighting for CLE](#syntax-highlighting-for-cle)
- [Running Tasks](#running-tasks)
- [Troubleshooting](#troubleshooting)

## Build
CVI has been developed, deployed, and tested using Ubuntu 19.10 x86_64 Linux. We recommend this distribution to simplify installation of external dependencies. Upon cloning the CVI repository, follow these steps to install required packages (assumes sudo permissions enabled for calling `apt`):

```
./build.sh -h
#Usage: ./build.sh [ -cdh ]
#-h        Help
#-c        Clean up
#-d        Dry run
```

Running this script without options will download and install VS Code, and build the following
* Visual Studio Code and its Extension Manager
* CLE VS Code extensions

## Installing VS Code Extensions
The CVI IDE is based on Visual Studio Code (vscode) with extensions. Two CLE extensions, CLE-Highlighter-0.0.1.vsix and CLE-themes-0.0.1.vsix, are available in the $CVI/build directory, if vscode is installed and the CLE extensions built successfullly in the Build step. In addition, many more extensions are available over the internet. We will install two extensions from the internet and two from the local build directory. Do the following to start VS Code then follow the instructions below to install extensions.

```
cd $CVI
code .
```

Install the C/C++ extension
* Select the bottom icon (four squares) on the left task bar
* Type c/c++ into the search box.
* Find the extension 'C/C++ IntelliSense, debugging, and code browsing' and click on its green Install button on the lower right.

Install .dot viewer extension
* Select the bottom icon (four squares) on the left task bar.
* Type dot into the search box.
* Find the extension "Graphviz (dot) language support for Visual Studio Code" and click on its green Install button on the lower right. Note that there are two extensions with the same name. Choose the one by Joao Pinto.

Locally built extensions have to be sideloaded as follows.
* Select the bottom icon (four squares) on the left task bar.
* Click the ... button at the top-right corner of the Extensions pane and select "Install from VSIX..." on the menu that appears.
* Locate the CLE-Highlighter-0.0.1.vsix file in the $CVI/build directory and click "Install".
* Locate the CLE-themes-0.0.1.vsix file in the $CVI/build directory and click "Install".

## Syntax Highlighting for CLE
CVI' syntax highlighter are derived from Reloaded-cpp and Reloaded-themese. To see that it is functioning correctly, start VS Code as follows, if it is not already running.

```
cd $CVI
code .
```

* Select the top icon (two pieces of paper) on the left task bar.
* Expand the example directory
* Click on the ex1.c file to open it in the editor panel.
* Look for lines starting with #pragma cle, each of the two words should be highlighted with a different color.

## Running Tasks
Two simple test tasks are defined in .vscode/tasks.json. To see how tasks are run, start VS Code as follows, if it is not already running.

```
cd $MULES/partitioner
code .
```
The following tasks, listed in order of dependency, are defined in the partitioner project.
* CVI Build - This is a task that runs the script that we had used above to build the project.
* CVI Clean - This task cleans up temporary files and diretories created by the build task.

To run a task,
* Select Run Task from the Terminal menu.
* A list of Partitioner tasks will be displayed.
* Select the desired task from the list.
* Select 'Continue with scanning the task output'

## Troubleshooting
If you are running VS Code through VNC and the backspace key is not working, do the following.
* File>Preferences>Settings
* Type Keyboard into the search box.
* Select keyboard
* Change the value to keyCode

