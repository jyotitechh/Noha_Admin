/* The formatted-text box used for the Daily Manna message and prayer, the
   prayers, confessions and the dream dictionary.

   It gives the office what the old app's editor had: undo and redo, bold,
   italic, underline, strikethrough, subscript, superscript, headings, lists,
   quotes and links. It hands back HTML; the server cleans that again on every
   save (server/rich.js), so what is kept is only what this toolbar can make. */

import { useEffect } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Link from '@tiptap/extension-link';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Text saved before the editor existed has no tags: show each line as a paragraph. */
const toHtml = (v: string) =>
  /<\/?[a-z][\s\S]*>/i.test(v)
    ? v
    : v.split(/\r?\n+/).filter((l) => l.trim()).map((l) => `<p>${escapeHtml(l)}</p>`).join('');

function Tool({ on, label, title, onClick, disabled }: {
  on?: boolean; label: React.ReactNode; title: string; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button type="button" className={'btn sm' + (on ? ' pri' : '')} title={title} aria-label={title}
      aria-pressed={on} disabled={disabled} onClick={onClick}
      /* Keep the selection in the editor when a button is pressed. */
      onMouseDown={(e) => e.preventDefault()}>
      {label}
    </button>
  );
}

function Toolbar({ ed }: { ed: Editor }) {
  const link = () => {
    const prev = ed.getAttributes('link').href as string | undefined;
    const url = window.prompt('Web address (https://…). Leave empty to remove the link.', prev ?? 'https://');
    if (url === null) return;
    if (url.trim() === '' || url.trim() === 'https://') { ed.chain().focus().unsetLink().run(); return; }
    if (!/^(https?:\/\/|mailto:|tel:)\S+$/i.test(url.trim())) { window.alert('The link must start with http://, https://, mailto: or tel:'); return; }
    ed.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };
  const c = () => ed.chain().focus();
  return (
    <div className="rte-bar" role="toolbar" aria-label="Formatting">
      <Tool title="Undo" label="↶" disabled={!ed.can().undo()} onClick={() => c().undo().run()} />
      <Tool title="Redo" label="↷" disabled={!ed.can().redo()} onClick={() => c().redo().run()} />
      <span className="rte-sep" />
      <Tool title="Bold" label={<b>B</b>} on={ed.isActive('bold')} onClick={() => c().toggleBold().run()} />
      <Tool title="Italic" label={<i>I</i>} on={ed.isActive('italic')} onClick={() => c().toggleItalic().run()} />
      <Tool title="Underline" label={<u>U</u>} on={ed.isActive('underline')} onClick={() => c().toggleUnderline().run()} />
      <Tool title="Strikethrough" label={<s>S</s>} on={ed.isActive('strike')} onClick={() => c().toggleStrike().run()} />
      <Tool title="Subscript" label={<>x<sub>2</sub></>} on={ed.isActive('subscript')} onClick={() => c().toggleSubscript().run()} />
      <Tool title="Superscript" label={<>x<sup>2</sup></>} on={ed.isActive('superscript')} onClick={() => c().toggleSuperscript().run()} />
      <span className="rte-sep" />
      <Tool title="Heading" label="H" on={ed.isActive('heading', { level: 2 })} onClick={() => c().toggleHeading({ level: 2 }).run()} />
      <Tool title="Bulleted list" label="• List" on={ed.isActive('bulletList')} onClick={() => c().toggleBulletList().run()} />
      <Tool title="Numbered list" label="1. List" on={ed.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()} />
      <Tool title="Quote" label="“ ”" on={ed.isActive('blockquote')} onClick={() => c().toggleBlockquote().run()} />
      <Tool title="Link" label="Link" on={ed.isActive('link')} onClick={link} />
      <Tool title="Clear formatting" label="Clear" onClick={() => c().unsetAllMarks().clearNodes().run()} />
    </div>
  );
}

export function RichText({ value, onChange, invalid, label }: {
  value: string; onChange: (html: string) => void; invalid?: boolean; label: string;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, code: false, codeBlock: false }),
      Underline, Subscript, Superscript,
      Link.configure({ openOnClick: false, autolink: false }),
    ],
    content: toHtml(value),
    editorProps: { attributes: { class: 'rte-body', 'aria-label': label, role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
  });

  /* The form owns the value; follow it if it is changed from outside (a reset). */
  useEffect(() => {
    if (editor && value !== (editor.isEmpty ? '' : editor.getHTML()) && !editor.isFocused) {
      editor.commands.setContent(toHtml(value), false);
    }
  }, [value, editor]);

  if (!editor) return null;
  return (
    <div className={'rte' + (invalid ? ' err' : '')}>
      <Toolbar ed={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
