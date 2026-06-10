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
          // Inconsolata is the Snowflake (Snowsight) worksheet editor typeface.
          fontFamily: "'Inconsolata', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 15,
          fontWeight: '600',
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
