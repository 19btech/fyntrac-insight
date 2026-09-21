import React, { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import MonacoEditor from '@monaco-editor/react';

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET',
  'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN', 'ON', 'AS', 'AND', 'OR',
  'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS NULL', 'IS NOT NULL', 'CASE', 'WHEN', 'THEN', 'ELSE',
  'END', 'UNION', 'UNION ALL', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
  'OVER', 'PARTITION BY', 'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'COALESCE', 'CAST', 'WITH',
];

// Inconsolata is the Snowflake (Snowsight) worksheet editor typeface. Both it
// and JetBrains Mono are webfonts (see index.html), so the stack ends in fonts
// that actually exist locally on each platform — Consolas on Windows, SF
// Mono/Menlo on macOS. Without Consolas, a Windows machine that fails to load
// the webfont falls through to generic `monospace`, i.e. Courier New, whose
// metrics are nothing like Inconsolata's.
const EDITOR_FONT_STACK =
  "'Inconsolata', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace";
const EDITOR_FONT_SIZE = 15;
const EDITOR_FONT_WEIGHT = '600';

/**
 * Re-measure once the webfonts have actually arrived.
 *
 * Monaco measures one character's advance width when it initialises and caches
 * it to place the caret, selection and every token. Inconsolata is loaded from
 * Google Fonts with `display=swap`, so on a cold cache Monaco measures the
 * FALLBACK font, the real font swaps in a moment later, and every column after
 * the first is then positioned using the wrong width. The error accumulates
 * along the line — a caret roughly two characters adrift by column 40.
 *
 * It only shows up where the fallback's metrics differ sharply from
 * Inconsolata's (Windows falling back to Courier New) and where the font is not
 * already cached — which is why it reproduces on a live site but not locally,
 * and not on macOS.
 */
function remeasureWhenFontsReady(monaco) {
  const remeasure = () => {
    try {
      monaco.editor.remeasureFonts();
    } catch {
      /* editor already disposed */
    }
  };

  // One deferred pass regardless. The editor mounts inside a dialog, and a
  // measurement taken while that dialog is still animating (it opens under a
  // transform) is distorted in the same way a font swap distorts it.
  setTimeout(remeasure, 600);

  if (!document.fonts) return; // no Font Loading API — the pass above is all we get

  // Ask for the exact faces the editor renders in, then remeasure. `ready`
  // covers the general case (and resolves immediately if fonts are cached);
  // the explicit loads cover a face that nothing else on the page requested.
  const faces = [
    `${EDITOR_FONT_WEIGHT} ${EDITOR_FONT_SIZE}px Inconsolata`,
    `${EDITOR_FONT_WEIGHT} ${EDITOR_FONT_SIZE}px 'JetBrains Mono'`,
  ];
  Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null)))
    .then(remeasure)
    .catch(remeasure);
  document.fonts.ready.then(remeasure).catch(() => {});
}

/**
 * Monaco SQL editor with collection/field autocomplete and Ctrl/Cmd+Enter to
 * run. A single instance is reused across worksheet tabs (the parent swaps
 * `value`), so the completion provider is registered exactly once.
 *
 * `onRun` and `collections` are read through refs so the editor command and the
 * completion provider always see the latest values without re-registering.
 */
export default function SqlEditor({ value, onChange, onRun, collections, apiRef }) {
  const onRunRef = useRef(onRun);
  const collectionsRef = useRef(collections);
  const providerRef = useRef(null);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);

  useEffect(() => { onRunRef.current = onRun; }, [onRun]);
  useEffect(() => { collectionsRef.current = collections; }, [collections]);
  useEffect(() => () => providerRef.current?.dispose(), []);

  const handleMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    remeasureWhenFontsReady(monaco);
    if (apiRef) {
      apiRef.current = {
        // Insert text at the cursor (used when a field is clicked in the sidebar).
        insertText: (text) => {
          const sel = editor.getSelection();
          editor.executeEdits('sqllab-insert', [{ range: sel, text, forceMoveMarkers: true }]);
          editor.focus();
        },
        focus: () => editor.focus(),
      };
    }
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRunRef.current?.();
    });

    providerRef.current?.dispose();
    providerRef.current = monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: [' ', '.', ','],
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const colls = collectionsRef.current || [];
        const suggestions = [];

        for (const c of colls) {
          suggestions.push({
            label: c.name,
            kind: monaco.languages.CompletionItemKind.Struct,
            insertText: c.name,
            detail: 'collection',
            range,
          });
          for (const f of c.fields || []) {
            suggestions.push({
              label: f.name,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: f.name,
              detail: `${c.name} · ${f.type}`,
              range,
            });
          }
        }
        for (const kw of SQL_KEYWORDS) {
          suggestions.push({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: kw,
            range,
          });
        }
        return { suggestions };
      },
    });
  };

  return (
    <Box sx={{ height: '100%', '& .monaco-editor': { borderRadius: 0 } }}>
      <MonacoEditor
        height="100%"
        language="sql"
        theme="vs"
        value={value}
        onChange={(v) => onChange(v ?? '')}
        onMount={handleMount}
        options={{
          fontFamily: EDITOR_FONT_STACK,
          fontSize: EDITOR_FONT_SIZE,
          fontWeight: EDITOR_FONT_WEIGHT,
          lineHeight: 22,
          fontLigatures: false,
          letterSpacing: 0.2,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          renderLineHighlight: 'line',
          padding: { top: 12, bottom: 12 },
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          suggestOnTriggerCharacters: true,
        }}
      />
    </Box>
  );
}
