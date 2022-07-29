import type { Ace } from "ace-builds";
import {ace} from "./LoadAce"
// @ ts-ignore
//import TJPWorker from "./external/tigerjython-parser-worker.js?worker"
import {tjpWorkerString} from "./inlinedTJP.js"

export type TMode = "javascript" | "python" | "html"

export interface IEditorState {
  element: HTMLElement
  mode: TMode,
  theme: "monokai" | "chrome" | string
  fontSize: number,
  code: string
  readOnly: boolean,
  disableSelect: boolean
  showLineNumbers: boolean
  minLines: number
  maxLines: number
  showGutter: boolean
  showInvisibles: boolean
}

export interface IEditor {
  readonly editorState: IEditorState
}

export class Editor implements IEditor {
  readonly editorState: IEditorState
  // private readonly mode: "python" | "javascript" | undefined;
  // private _maxLines: number | undefined;
  // private readonly editor: AceAjax.Editor;
  // private _beautify: any;
  private pythonCodeCheckWorker?: Worker;
  private pythonCodeCheckWorkerBusy?: boolean;
  private parserTimeout?: number;
  aceEditor: Ace.Editor;

  constructor(config: Partial<IEditorState>) {
    this.editorState = Object.assign({
      element: document.getElementById('editor') || document.createElement("div"),
      mode: "python",
      theme: "monokai", //"chrome"
      fontSize: 18,
      code: "",
      readOnly: false,
      disableSelect: false,
      showLineNumbers: !["html", "css", "svg"].includes(config.mode || ""),
      minLines: 4,
      showInvisibles: config.mode === "python",
      maxLines: 20,
      showGutter: true
    }, config)
    const {code, element, minLines, maxLines, theme, mode, showGutter, showLineNumbers, readOnly, fontSize, showInvisibles} = this.editorState
    //this.editorState.code = code || (aceElement.querySelector("code") || aceElement).textContent || "";
    this.aceEditor = ace(element);
    const editor = this.aceEditor;
    editor.setTheme("ace/theme/" + theme);
    editor.session.setMode("ace/mode/" + mode);
    editor.setOptions({
      showGutter,
      showPrintMargin: false,
      maxLines,
      minLines,
      highlightActiveLine: false,
      showLineNumbers,
      readOnly,
      scrollPastEnd: 0.05,
      showInvisibles
      // enableBasicAutocompletion: true,
      // enableLiveAutocompletion: true,
      // enableSnippets: false
    });
    //editor.session.setUseWorker(false); //remove this if you want live error checking. Activated because of await error.
    editor.resize();
    editor.setFontSize(fontSize + "px");
    editor.getSession().setOptions({ tabSize: 4, useSoftTabs: false });
    editor.getSession().setValue(code);
    this.setRules();
    // @ts-ignore
    editor.$blockScrolling = Infinity;

    if(mode === "python") {
      this.addPythonCodeCheckWorker()
    }

    if(this.editorState.disableSelect) {
      editor.getSession().selection.on('changeSelection', function () {
        editor.getSession().selection.clearSelection();
      });
    }

    //save
    editor.commands.addCommand({
      name: 'save',
      bindKey: {win: "Ctrl-S", "mac": "Cmd-S"},
      exec: function() {
        element.dispatchEvent(new CustomEvent("my-save", { bubbles: true, "detail": ""}));
      }
    })
  }

  addPythonCodeCheckWorker() {
    let lastErrors = ""
    if (typeof(window.Worker) !== "undefined" && tjpWorkerString) {
      if(!this.pythonCodeCheckWorker) {
        var blob = new Blob([tjpWorkerString]);
        this.pythonCodeCheckWorker = new Worker(window.URL.createObjectURL(blob)) as Worker
      }
      this.pythonCodeCheckWorker.onmessage = (event) => {
        this.pythonCodeCheckWorkerBusy = false
        let errs = event.data
        const errorString = errs.map((e: { text: any; })=>e.text).join("-")
        if(errorString != lastErrors) {
          lastErrors = errorString
          this.aceEditor.getSession().setAnnotations(errs);
        }

      };
      const scheduleWorker = () => {
        clearTimeout(this.parserTimeout)
        this.parserTimeout = setTimeout(checkPython, 200)
      }
      const checkPython = () => {
        if(this.pythonCodeCheckWorkerBusy) scheduleWorker()
        const pycode = this.aceEditor.getSession().getValue()
        this.pythonCodeCheckWorker?.postMessage(pycode)
        this.pythonCodeCheckWorkerBusy = true
      }
      
      scheduleWorker()
      // @ts-ignore
      this.aceEditor.getSession().on("change", scheduleWorker)
    }
  }

  setRules() {
    let regexesToIgnore = [
      /doctype first\. Expected/, //html
      /Unexpected End of file\. Expected/, //html
      /'-' after '--' found in comment/, //html
      /Unexpected character in comment found/, //html
    ];
    // @ts-ignore

    this.aceEditor.getSession().on('changeAnnotation', () => {
      const rawAnnotations = this.getAnnotations() || []
      const filtered = rawAnnotations.filter((a: { text: string; })=> !regexesToIgnore.some(r=>r.test(a.text)))
      if(rawAnnotations.length > filtered.length) {
        this.aceEditor.session.setAnnotations(filtered)
      }
    });
    if(this.editorState.mode === "javascript") this.changeOptionsJS()
  }

  private changeOptionsJS() {
    // @ts-ignore
    const worker = this.aceEditor.session.$worker
    if(worker) {
      return worker.send('changeOptions', [{ asi: true }])
    }
    else {
      return setTimeout(()=>this.changeOptionsJS(), 100)
    }
  }

  resize() {
    return this.aceEditor.resize();
  }

  setValue(code: string) {
    return this.aceEditor.getSession().setValue(code);
  }

  getValue() {
    return this.aceEditor.getSession().getValue()
  }

  undo() {
    return this.aceEditor.undo();
  }

  redo() {
    return this.aceEditor.redo();
  }

  getAnnotations() {
    return this.aceEditor.getSession().getAnnotations();
  }

  sizeup() {
    this.setFontSize(this.editorState.fontSize + 1)
  }

  sizedown() {
    this.setFontSize(this.editorState.fontSize - 1)
  }

  setFontSize(val: number) {
    this.editorState.fontSize = val
    return this.aceEditor.setFontSize(val + "px");
  }
}

/***
this._beautify =  ace.require("ace/ext/beautify");
// @check: window.beautifyOptions = this._beautify.options;


beautify() {
  this._beautify.beautify(this.editor.session);
}

 const langTools = ace.require("ace/ext/language_tools");
console.log(langTools);
       enableBasicAutocompletion: true,
      enableLiveAutocompletion: true,
      enableSnippets: false
**/