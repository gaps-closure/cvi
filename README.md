# Closure Visual Interface (CVI)
This repository hosts the open source components of CVI. The `master` branch contains the most recent public release software while `develop` contains bleeding-edge updates and work-in-progress features for use by beta testers and early adopters.

This repository is maintained by Perspecta Labs.

## Contents
- [Build](#build)
- [Installing VS Code Extensions](#installing-vs-code-extensions)
- [Syntax Highlighting for CLE](#syntax-highlighting-for-cle)
- [Running the Partitioner](#running-the-partitioner)
- [Viewing the Dependency Graph](#viewing-the-dependency-graph)
- [Troubleshooting](#troubleshooting)

## Build
CVI has been developed, deployed, and tested using Ubuntu 19.10 x86_64 Linux. We recommend this distribution to simplify installation of external dependencies. Upon cloning the CVI repository, follow these steps to install required packages (assumes sudo permissions enabled for calling `apt`):

```
./build.sh 
```

This script downloads, installs or builds the following
* LLVM binaries
* Visual Studio Code and its Extension Manager
* CLE VS Code extensions
* pdg
* quala
* partitioner

## Installing VS Code Extensions
The CVI IDE is based on Visual Studio Code (vscode) with extensions. Two CLE extensions, CLE-Highlighter-0.0.1.vsix and CLE-themes-0.0.1.vsix, are available in the $CVI/build directory, if vscode is installed and the CLE extensions built successfullly in the Build step. In addition, many more extensions are available over the internet. We will install two extensions from the internet and two from the local build directory. Do the following to start VS Code then follow the instructions below to install extensions.

```
cd $CVI/partitioner
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
cd $CVI/partitioner
code .
```

* Select the top icon (two pieces of paper) on the left task bar.
* Expand the example directory
* Click on the ex1.c file to open it in the editor panel.
* Look for lines starting with #pragma cle, each of the two words should be highlighted with a different color.

## Running the Partitioner
Start VS Code as follows, if it is not already running.

```
cd $CVI/partitioner
code .
```
The following tasks, listed in order of dependency, are defined in the partitioner project.
* Partitioner Compile - build partitioner library src/libxdcomms.a
* Partitioner Clang - Run a simple example ex1.c with CLE markings through the CLE preprocessor to generate annotations (ex1.mod.c) and an annotation map file (ex1.c.clemap.json). Then compile them using clang.
* Partitioner LLVM IR and Bitcode Gen - Run the ex1.mod.c through LLVM IR and bytecode generation, resulting ex1.mod.bc and ex1.mod.ll.
* Partitioner Dependency Graph - Build the program dependency graph. Serveral .dot files are generated. Only pdgraph.main.dot is actually used at this time.
* Partitioner Partition - Finally, run the partitioner and display the analysis of the program and the actions needed to be undertaken to partition it into independent security enclaves.

Each task depends on its immediate predecessor. All predecessors of a task will be run before the task itself is run.
To run all tasks, choose the Partiion task. The "Partitioner Clean" task cleans up all intermediate files.

To run a task,
* Select Run Task from the Terminal menu.
* A list of Partitioner tasks will be displayed.
* Select the desired task from the list.
* Select 'Continue with scanning the task output'

## Viewing the Dependency Graph
Start VS Code as follows, if it is not already running.

```
cd $CVI/partitioner
code .
```
* Run the Partitioner Partition task as described above.
* Select the top icon (two pieces of paper) on the left task bar.
* Expand the example directory
* Click on the pdgraph.main.dot file to open it in the editor panel.
* Click on the ... button in the upper right corner and select Open Preview ti the Side.
* Expand the panel that appears on the right to see the graph. Use the buttons at the bottom to zoom or pan the graph.

Use the same procedure on the enclaves.dot file to see a colored graph.

## Troubleshooting
If you are running VS Code through VNC and the backspace key is not working, do the following.
* File>Preferences>Settings
* Type Keyboard into the search box.
* Select keyboard
* Change the value to keyCode

