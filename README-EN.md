IOTerm is a simple front-end terminal component but not as same as a terminal. It is just in charge of <b>Input</b> and <b>Output</b> but do not care about what is the input, what is the output and how the input will be precessed. To make full use of a web page, there are some differences between IOTerm and the terminal we use in a Linux distribution.

[中文版](./README.md)

### Differences
* IOTerm does not process any data. The handler need to be defined by you.
* Question-and-answer interaction is supported. If you need some complex interactions such as vim, it is better for you to implement a text editor with rich functions.
* We used to typing &lt;Tab&gt; for prompting. It is the same here. But the form of prompting is different. A panel will show prompts at the first time typing &lt;Tab&gt;. And choose a prompt by typing &lt;Tab&gt;. Select a prompt by typing &lt;Enter&gt;. Type &lt;Esc&gt; for end.
* If you paste text including line feeds, the terminal will run the commands one by one immediately excluding the last one without a line feed. Here, IOTerm will not run the commands immediately. Like paste lines into a single line input box, line feeds will be regarded as white spaces.

## Release log
### v1.0.0
1. IOTerm with complete functions.

### v1.1.0
1. Change default font size to 1 em.
2. Remove the limit of minimum width and minimum height.
3. Use shadow DOM.

### v1.1.1
1. Provide interface to set margin.
2. Provide interface to set padding.

### Features
* auto wraping
* input cursor with flashing and moving
* input method following
* copying and pasting
* highlighting
* scrolling as same as a real terminal
* simple interaction
* history
* prompting
* custom color and font

### Getting Start
1. Installation
```
npm install --save ioterm
```

2. Importing and instantiation
```
import { IOTerm } from 'ioterm';

var ioterm = IOTerm(parentElement);

```

3. [Here](https://github.com/kaiopen/ioterm-demo) for examples.

### TODO
* Customize scrollbar or provide a interface for customizing scrollbar.

### Methods of IOTerm
1. `end()`
The method should be called when the command is finished. And the prefix will be printed.

2. `setColor({text, background}: {text?: string, background?: string})`
Set color of text or background.

3. `setCommandHandler(commandHandler: Function)`
Set a handler to handle commands. The handler has one input parameter `command`, a string input by user. It may be a correct linux command such as "ls", "cd ~/Documents", or "python hello.py". It could be something else without a clear meaning such as " ", "!", "Hello World". It also could be the input input by users when a command is processed or running.

4. `setFont({family, size}: {family?: string, size?: string})`
Set font family or size.

5. `setMargin(margin: string)`
Set margin as same as setting margin in css.

6. `setPadding(padding: string)`
Set padding as same as setting padding in css.

7. `setPrefix(html: string)`
Set the prefix we used to seeing in a terminal, including the virtual environment, the user name, the server name, the current work directory and an indicator for permissions. The `html` should be preprocessed by function `highlight`.

8. `setTabHandler(tabHandler: Function)`
Set a handler for prompting. The handler has two input paremeters, the string input by users and the position of the input cursor. The return must be an array of strings or an empty array.

9. `write(html: string)`
Write and show something. The `html` should be preprocessed by function `highlight`. If a newline is wanted, please add a line feed "\\n" rather than "\\r\\n", "\\r" or HTML tag "<br>".

### Functions
1. `highlight(text: string, style?: string)`
Highlight `text` with `style`.

# License
MIT License