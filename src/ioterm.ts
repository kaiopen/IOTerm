// TODO:
// 1 复制时的文本处理（去除<br>导致的空格）；粘贴时对换行符的处理
// 2 resize

interface historyItem {
    value: string,
    modification: string
}

function escapeText(strHtml: string) {
    // Replace character '<', '>' and '&' to '&lt;', '&gt;' and '&amp;'.

    return strHtml.replace(
        /[<>&]/g,
        (c) => {
            return {'<':'&lt;', '>':'&gt;', '&': '&amp;'}[c];
        }
    );
}

class IOTerm {
    private term: HTMLDivElement;
    private measurement: HTMLPreElement;
    private input: HTMLInputElement;

    // The element `htmlPanel` shows `html` and `tmpPanel` shows others.
    private container: HTMLDivElement;
    private htmlPanel: HTMLPreElement;
    private tmpPanel: HTMLPreElement;

    // The element `input` moves as soon as the element `cursor` moving.
    private cursor: HTMLDivElement;
    private cursorBg: HTMLDivElement;
    private cursorContent: HTMLDivElement;

    private prefix: string;

    // `lastLine` saves the last lighlighted readonly line which does not end 
    // with a line feed. Even an empty line is a newline.
    private lastLine: string;

    // `numRows` is the number of rows of readonly text including
    // `html` and `lastLine`. A new line is caused by
    // character '\n' or HTML tag <br>. The initial value, 1, means the
    // `lastLine` even empty.
    private numRows: number;

    private history: { index: number, items: historyItem[] };
    
    private charWidth: number;
    private charHeight: number;

    // A timer for flashing cursor.
    private timer: any;

    private isRunning: boolean;

    private commandHandler: Function;

    private tabPanel: HTMLDivElement;
    private promptIndex: number;  // 计数按<Tab>键的次数
    private tabHandler: Function;

    constructor(parentElement: HTMLElement) {
        this.term = document.createElement('div');
        this.measurement = document.createElement('pre');
        this.input = document.createElement('input');

        this.container = document.createElement('div');
        this.htmlPanel = document.createElement('pre');
        this.tmpPanel = document.createElement('pre');
        
        this.tabPanel = document.createElement('div');
        
        this.cursor = document.createElement('div');
        this.cursorBg = document.createElement('div');
        this.cursorContent = document.createElement('div');
        
        parentElement.append(this.term);
        this.term.append(
            this.measurement, this.input,
            this.container,
            this.tabPanel,
            this.cursor
        );
        this.container.append(this.htmlPanel, this.tmpPanel);
        this.cursor.append(this.cursorBg, this.cursorContent);
        
        this.prefix = '';
        this.lastLine = '';
        this.numRows = 1;
        this.history = { 
            index: 0, 
            items: [{ value: '', modification: '' }] 
        };
        this.commandHandler = () => { this.end(); };
        this.promptIndex = -1;
        this.tabHandler = () => { 
            return [
                '<span style="color: #729fcf;">.</span>', 
                '<span style="color: #729fcf;">..</span>',
                '<span style="color: #729fcf;">abcd</span>'
            ]; 
        };

        this.setStyle();
        this.addEventListeners();
        this.moveCursor(this.numRows, 0);
    }

    public end() {
        this.isRunning = false;
        this.write(this.prefix);
    }

    public resize() {
        let text = this.input.value;
        let cursorPos = this.input.selectionStart;
        this.input.value = ''; 

        let html = this.htmlPanel.innerHTML + this.lastLine;
        html = html.replace(/<br>/g, '');
        this.clearPanel();
        this.write(html);

        if (text) {
            this.inputText(text);
            this.input.value = text;
            this.input.setSelectionRange(cursorPos, cursorPos);

            let wrap = this.autoWrap(
                this.lastLine +
                escapeText(text.substring(0, cursorPos))
            );
            this.moveCursor(
                this.numRows + wrap.numRows - 1,
                wrap.colOffset,
                text.charAt(cursorPos)
            )
        }

        this.enableInput();
    }

    public setColor({text, background}: {text?: string, background?: string}) {
        if (text) {
            this.term.style.color = text;
            this.cursorBg.style.backgroundColor = text
            this.tabPanel.style.color = text;
        }
        if (background) {
            this.term.style.backgroundColor = background;
            this.cursorContent.style.color = background;
        } 
    }

    public setCommandHandler(commandHandler: Function) {
        this.commandHandler = commandHandler;
    }

    public setFont({family, size}: {family?: string, size?: string}) {       
        if (family) {
            this.term.style.fontFamily = family;
            this.input.style.fontFamily = family;
        }
        if (size) {
            this.term.style.fontSize = size;
            this.input.style.fontSize = size;
        }

        this.measurement.innerHTML = '&nbsp;';
        this.charWidth = this.measurement.offsetWidth;
        this.charHeight = this.measurement.offsetHeight;
        this.cursor.style.height = this.charHeight + 'px';
        this.cursorBg.style.height = this.charHeight - 2 + 'px';

        this.resize();
    }

    public setPadding({top, right, bottom, left}: {
        top?: string, 
        right?: string, 
        bottom?: string, 
        left?: string
    }) {
        if (top !== void 0) {
            this.htmlPanel.style.marginTop = top;
        }
        if (right !== void 0) {
            this.htmlPanel.style.marginRight = right;
            this.tmpPanel.style.marginRight = right;
        }
        if (bottom !== void 0) {
            this.tmpPanel.style.marginBottom = bottom;
        }
        if (left !== void 0) {
            this.htmlPanel.style.marginLeft = left;
            this.tmpPanel.style.marginLeft = left;
        }
    }

    public setPrefix(html: string) {
        this.prefix = html;
    }

    public setTabHandler(tabHandler: Function) {
        this.tabHandler = tabHandler;
    }

    public write(html: string) {
        // `html` is a escaped and highlighted string that uses HTML tag <span>
        // wrapping around the text that should be highlighted and character
        // '\n' as line feed rather than <br> and '\r\n'. Note that character
        // '<' and '>' should be escaped to '&lts' and '&gt;'.

        if (!html) {
            return
        }

        // Automatically scroll to the bottom if the scrollbar was at the
        // bottom before writing.
        let isScroll = false;
        if (
            this.term.scrollHeight -
            this.term.scrollTop -
            this.term.offsetHeight <= 1
        ) {
            isScroll = true;
        }

        html = this.lastLine + this.input.value + html;
        this.input.value = '';

        let lines = html.split('\n');
        let lastIdx = lines.length - 1;
        let wrappedLine: string;
        let wrap: { wrappedHTML: string, numRows: number, colOffset: number }
        let wrappedHTML = this.htmlPanel.innerHTML;
        
        this.numRows--;
        if (lastIdx > 0) {
            for (let i = 0; i < lastIdx; i++) {
                wrap = this.autoWrap(lines[i]);
                wrappedHTML += wrap.wrappedHTML + '\n';
                this.numRows += wrap.numRows;
            }
        }

        wrap = this.autoWrap(lines[lastIdx])
        wrappedLine = wrap.wrappedHTML;
        this.numRows += wrap.numRows;

        lastIdx = wrappedLine.lastIndexOf('<br>');
        if (lastIdx === -1) {
            this.lastLine = wrappedLine;
        } else {
            lastIdx += 4;
            wrappedHTML += wrappedLine.substring(0, lastIdx);
            this.lastLine = wrappedLine.substring(lastIdx);
        }
        this.htmlPanel.innerHTML = wrappedHTML;
        this.tmpPanel.innerHTML = this.lastLine;
        this.moveCursor(this.numRows, wrap.colOffset);

        if (isScroll) {
            this.term.scrollTop = this.term.scrollHeight;
        }
    }

    private addEventListeners() {
        this.term.addEventListener('mouseup', (event) => {
            let selectionText = window.getSelection().toString();
            if (selectionText === '') {
                let scrollTop = this.term.scrollTop;
                this.enableInput();
                this.flashCursor();
                this.term.scrollTop = scrollTop;
            }
        });

        this.term.addEventListener('copy', (event) => {
            let selectionText = window.getSelection().toString();
            if (selectionText) {
                selectionText = selectionText
                                .replace(/\r\n/g, ' ')
                                .replace(/\r/g, ' ')
                                .replace(/\n/g, ' ');

                event.clipboardData.setData('text/plain', selectionText);
            }
            event.preventDefault();
        });

        this.term.addEventListener('paste', (event) => {
            let pasteText = event.clipboardData.getData('text');
            if (pasteText) {
                pasteText = pasteText.replace(/\r\n/g, ' ')
                                     .replace(/\r/g, ' ')
                                     .replace(/\n/g, ' ');

                let text = this.input.value;
                let cursorPos = this.input.selectionStart;
                let preText = text.substring(0, cursorPos) + pasteText;
                text = preText + text.substring(cursorPos);
                this.input.value = text;
                this.input.setSelectionRange(preText.length, preText.length);

                this.history.items[this.history.index].modification = text;

                this.inputText(text);
            }
            event.preventDefault();
        });

        this.input.addEventListener('input', (event) => {
            let text = this.input.value;
            this.history.items[this.history.index].modification = text;
            this.inputText(text);
        });

        this.input.addEventListener('blur', () => {
            clearInterval(this.timer);
            this.cursor.style.visibility = 'hidden';
            this.input.disabled = true;
        });

        this.input.addEventListener('keydown', (event) => {
            let text: string;
            let index: number;
            let wrap: {
                wrappedHTML: string,
                numRows: number,
                colOffset: number
            }
            let item: historyItem;

            switch (event.keyCode) {
            case 13:  // Enter
                this.term.scrollTop = this.term.scrollHeight
                text = this.input.value.trim();
                this.input.value = '';
                if (text) {
                    this.write(escapeText(text) + '\n');

                    if (!this.isRunning) {
                        this.isRunning = true;
            
                        index = this.history.index;
                        let len = this.history.items.length;
                        this.history.items[len - 1].value = text;
                        this.history.items[index].modification = '';
                        this.history.index = len;
                        this.history.items.push({ 
                            value: '', 
                            modification: '' 
                        });
            
                        this.commandHandler(text);
                    }                    
                } else {
                    this.write('\n');
                    if (!this.isRunning) {
                        let lastIndex = this.history.items.length - 1;
                        this.history.items[lastIndex].modification = '';
                        this.history.index = lastIndex;
                        this.end();                        
                    }
                }
                break;

            // Moving the cursor.
            case 37:  // Left
                index = this.input.selectionEnd - 1
                if (index >= 0) {
                    text = this.input.value;
                    wrap = this.autoWrap(
                        this.lastLine +
                        escapeText(text.substring(0, index))
                    );
                    this.moveCursor(
                        this.numRows + wrap.numRows - 1,
                        wrap.colOffset,
                        text.charAt(index)
                    )
                }
                break;
            case 39:  // Right
                index = this.input.selectionEnd + 1;
                text = this.input.value;
                if (index <= text.length) {
                    wrap = this.autoWrap(
                        this.lastLine +
                        escapeText(text.substring(0, index))
                    );
                    this.moveCursor(
                        this.numRows + wrap.numRows - 1,
                        wrap.colOffset,
                        text.charAt(index)
                    )
                }
                break;

            // History.
            case 38:  // Up
                index = this.history.index - 1;
                item = this.history.items[index];
                if (item) {
                    this.history.index = index;
                    text = item.modification;
                    if (!text) {
                        text = item.value;
                    }
                    this.input.value = text;
                    this.inputText(text);                    
                }
                break;
            case 40:  // Down
                index = this.history.index + 1;
                item = this.history.items[index];
                if (item) {
                    this.history.index = index;
                    text = this.history.items[index].modification;
                    if (!text) {
                        text = item.value;
                    }
                    this.input.value = text;
                    this.inputText(text);
                }
                break;

            case 9:  // Tab
                console.log('Tab');
                if (this.promptIndex === -1) {
                    let prompts = this.tabHandler(this.input.value.trim());
                    let prompt: string;
                    for (let i = ++this.promptIndex; 
                         (i < this.promptIndex + 4) && (i < prompts.length); 
                         i++
                    ) {
                        prompt = prompts[i];
                        let item = document.createElement('div');
                        item.style.display = 'inline-block';
                        item.style.height = '100%';
                        item.style.paddingLeft = '10px';
                        item.style.paddingRight = '10px';
                        item.innerHTML = i + '. ' +prompt;
                        this.tabPanel.append(item);
                    }
                    this.promptIndex++;
                }
                break;
            }
        });
    }

    private autoWrap(html: string) {
        // Insert HTML tag <br> as line feed.
        //
        // `html` is a escaped and highlighted string that excludes line feed
        // '\n', '\r\n' or HTML tag <br> and uses HTML tag <span> wrapping
        // around the text that should be highlighted. Note that character '<',
        // '>' and '&' should be escaped to '&lts', '&gt;' and '&amp;' except
        // for HTML tags.
        //
        // This function returns a string composed by `html` and some line
        // feeds.

        this.measurement.innerHTML = html;
        let text = this.measurement.innerText;
        let lf = this.getLineFeedIndices(text);
        let lfIds = lf.lfIds;
        if (lfIds === []) {
            return {
                wrappedHTML: html,
                numRows: lf.numRows,
                colOffset: lf.colOffset
            };
        }

        let wrappedHTML = '';
        let i = 0;
        let length = 0;
        let isHTML = false;
        let startIdx = 0;
        let lfIdx = lfIds.shift();
        while (true) {
            if (!lfIdx) {
                wrappedHTML += html.substring(startIdx);
                break;
            }
            switch (html.charAt(i)) {
            case '<':
                isHTML = true;
                i++;
                continue;
            case '>':
                isHTML = false;
                i++;
                continue;
            case '&':
                if (['&lt;', '&gt;'].indexOf(html.substr(i, 4)) !== -1) {
                    i += 3;
                } else if ('&amp;' === html.substr(i, 5)) {
                    i += 4;
                }
                break;
            }
            if (isHTML) {
                i++;
                continue;
            }

            length++;
            i++;
            if (length === lfIdx) {
                wrappedHTML += html.substring(startIdx, i) + '<br>';
                startIdx = i;
                lfIdx = lfIds.shift();
            }
        }
        return {
            wrappedHTML,
            numRows: lf.numRows,
            colOffset: lf.colOffset
        };
    }

    private clearPanel() {
        this.htmlPanel.innerHTML = '';
        this.tmpPanel.innerHTML = '';
        this.lastLine = '';
        this.numRows = 1; 
    }
    
    private enableInput() {
        this.input.disabled = false;
        this.input.focus();
        this.cursor.style.visibility = 'visible';
    }

    private flashCursor() {
        // Flash the cursor three times.

        clearInterval(this.timer);
        this.cursor.style.opacity = '1';
        let i = 1;
        this.timer = setInterval(() => {
            this.cursor.style.opacity = i++ % 2 ? '0': '1';
            i === 7 && (clearInterval(this.timer));
        }, 500);
    }

    private getLineFeedIndices(text: string) {
        // Find the index where to insert line feeds in the string `text`.
        //
        // This function returns a object containing `lfIds`, `numRows` and
        // 'colOffset'. `lfIds` is an array recording the indices where to
        // insert line feeds in the string `text`. `numRows` is the number of
        // rows after `text` is inserted with line feeds <br>. 'colOffset' is
        // the width in pixel of the last line after `text` is inserted with
        // line feeds <br>.

        // `startIdx` is the starting index of string `subText` in string
        // `text`.
        let startIdx = 0;
        let maxWidth = this.htmlPanel.offsetWidth;
        let lfIds: number[] = [];

        let subText: string;
        let subTextWidth: number;
        let endIdx: number;
        let line: string;
        let lineWidth: number;
        let preState = 0;
        // In each iteration, find a line whose length is less than `maxWidth`.
        // Do not insert the line feed <br> into the last line even if its
        // length is equal to `maxWidth`.
        while (true) {
            subText = text.substring(startIdx);
            this.measurement.innerHTML = escapeText(subText);
            subTextWidth = this.measurement.offsetWidth;
            if (subTextWidth > maxWidth) {
                // `endIdx` computed here is a rough index where to insert a
                // linefeed in string `subText`. And it is also the number of
                // characters.
                endIdx = Math.floor(subText.length * maxWidth / subTextWidth);

                // For an exact index, it is necessary to compare the
                // relationship between the rough index and its consecutive
                // indices.
                preState = 0;
                while (true) {
                    // line = text.substring(startIdx, startIdx + endIdx);
                    line = subText.substring(0, endIdx);
                    this.measurement.innerHTML = escapeText(line);
                    lineWidth = this.measurement.offsetWidth;
                    if (lineWidth === maxWidth) {
                        // `endIdx` here is the exact index where to insert a
                        // linefeed in string `subText'. Also, `startIdx`
                        // computed here is an exact index where to insert a
                        // linefeed in string `text`.
                        startIdx += endIdx;
                        lfIds.push(startIdx);
                        break;
                    } else if (lineWidth < maxWidth) {
                        // If a string consists of some narrow characters at
                        // the beginning and wide characters at end, such as
                        // '1234一二三四', the rough index will be smaller.
                        if (preState > 0) {
                            startIdx += endIdx;
                            lfIds.push(startIdx);
                            break;
                        } else if (preState < 0) {
                            endIdx++;
                        } else {
                            preState = -1;
                            endIdx++;
                        }
                    } else {
                        if (preState < 0) {
                            startIdx += endIdx - 1;
                            lfIds.push(startIdx);
                            break;
                        } else if (preState > 0) {
                            endIdx--;
                        }
                        else {
                            preState = 1;
                            endIdx--;
                        }
                    }
                }
            } else {
                break;
            }
        }
        return {
            lfIds: lfIds,
            // Even a empty line '' will be counted as a newline.
            numRows: 1 + lfIds.length,
            colOffset: subTextWidth
        };
    }

    private inputText(text: string) {
        let wrap = this.autoWrap(this.lastLine + escapeText(text));
        this.tmpPanel.innerHTML = wrap.wrappedHTML;

        let cursorPos = this.input.selectionStart;
        if (cursorPos === this.input.value.length) {
            this.moveCursor(this.numRows + wrap.numRows - 1, wrap.colOffset)
        } else {
            wrap = this.autoWrap(
                this.lastLine +
                escapeText(text.substring(0, cursorPos))
            )
            this.moveCursor(
                this.numRows + wrap.numRows - 1,
                wrap.colOffset,
                text.charAt(cursorPos)
            )
        }
    }

    private moveCursor(numRows: number, colOffset: number, character?: string) {
        let charWidth: number;
        let charHeight: number;
        if (!character) {
            character = '&nbsp;';
            charWidth = this.charWidth;
            charHeight = this.charHeight;
        } else {
            this.measurement.innerHTML = character;
            charWidth = this.measurement.offsetWidth;
            charHeight = this.measurement.offsetHeight;
        }
        if (colOffset + charWidth >= this.htmlPanel.offsetWidth) {
            numRows += 1;
            colOffset = 0;
        }
        let top = charHeight * (numRows - 1);

        // Move input cursor.
        this.cursor.style.top = top + 'px';
        this.cursor.style.left = colOffset + 'px';
        this.cursor.style.width = charWidth + 'px';
        this.cursorContent.innerHTML = character;
        this.flashCursor();

        // Move input box so that the input method can follow the cursor.
        this.input.style.top = top + 'px';
        this.input.style.left = colOffset + 'px';
    }

    private setStyle() {
        this.term.style.position = 'relative';
        // The term must be able to show one widest character at least.
        // Note that different characters may be in different widths.
        this.term.style.width = '100%';
        this.term.style.minWidth = '100px';
        this.term.style.height = '100%';
        this.term.style.minHeight = '30px';
        this.term.style.lineHeight = '1.5';
        this.term.style.overflowX = 'hidden';
        this.term.style.overflowY = 'scroll';

        this.measurement.style.position = 'absolute';
        this.measurement.style.top = '0';
        this.measurement.style.left = '0';
        this.measurement.style.zIndex = '-100';
        this.measurement.style.margin = '0';

        this.input.style.position = 'absolute';
        this.input.style.top = '0';
        this.input.style.left = '0';
        this.input.style.zIndex = '-100';
        this.input.style.width = '0';
        this.input.style.border = 'none';
        this.input.style.padding = '0';
        this.input.style.lineHeight = '1.5';

        this.container.style.width = '100%';
        this.container.style.height = 'calc(100% + 1px)'

        this.htmlPanel.style.width = '100%';
        this.htmlPanel.style.margin = '0';

        this.tmpPanel.style.width = '100%';
        this.tmpPanel.style.margin = '0';

        this.tabPanel.style.display = 'flex';
        this.tabPanel.style.justifyContent = 'space-around';
        this.tabPanel.style.position = 'absolute';
        this.tabPanel.style.top = '100px';
        this.tabPanel.style.left = '0';
        this.tabPanel.style.width = '100%';
        this.tabPanel.style.height = '3em';
        this.tabPanel.style.margin = '5px';
        this.tabPanel.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        this.tabPanel.style.lineHeight = '3em';
        this.tabPanel.style.textOverflow = 'ellipsis';
        this.tabPanel.style.overflow = 'hidden';
        // this.tabPanel.style.visibility = 'hidden';

        this.cursor.style.position = 'absolute';
        this.cursor.style.top = '0';
        this.cursor.style.left = '0';
        this.cursor.style.display = 'flex';
        this.cursor.style.alignItems = 'center';
        this.cursor.style.border = 'none';

        this.cursorBg.style.width = '100%';

        this.cursorContent.style.position = 'absolute';
        this.cursorContent.style.top = '0';
        this.cursorContent.style.left = '0';
        this.cursorContent.style.height = '100%';
        
        this.setPadding({
            top: '1px',
            bottom: '1px',
            left: '3px'
        });
        this.setColor({
            text: '#eee',
            background: '#2e3436'
        });
        this.setFont({
            family: 'monospace',
            size: '14px'
        });
    }
}

export { escapeText, IOTerm };
