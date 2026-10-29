import { useEffect, useRef, useState } from "react"
import type * as MonacoApi from "monaco-editor/editor/editor.api"

import { useTheme } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

// The editor is created once and then kept in sync through effects, so the
// component never hands Monaco a new instance on every keystroke.
function useMonacoTheme() {
  const { theme } = useTheme()
  const [resolved, setResolved] = useState<"light" | "dark">("light")

  useEffect(() => {
    const root = document.documentElement
    const sync = () =>
      setResolved(root.classList.contains("dark") ? "dark" : "light")
    sync()

    const observer = new MutationObserver(sync)
    observer.observe(root, { attributeFilter: ["class"], attributes: true })
    return () => observer.disconnect()
  }, [theme])

  useEffect(() => {
    let cancelled = false
    void import("@/lib/monaco").then(({ monaco, themeForDocument }) => {
      if (!cancelled) {
        monaco.editor.setTheme(themeForDocument())
      }
    })
    return () => {
      cancelled = true
    }
  }, [resolved])
}

function EditorFrame({
  ariaLabel,
  language,
  className,
  hostRef,
  ready,
}: {
  ariaLabel: string
  language: string
  className?: string
  hostRef: React.RefObject<HTMLDivElement | null>
  ready: boolean
}) {
  return (
    <div
      role="region"
      aria-label={ariaLabel}
      aria-busy={!ready}
      data-language={language}
      className={cn(
        "relative min-h-0 overflow-hidden rounded-md border bg-muted/20",
        className
      )}
    >
      <div ref={hostRef} className="h-full w-full" />
      {ready ? null : (
        <p className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          Loading editor…
        </p>
      )}
    </div>
  )
}

export interface CodeEditorHandle {
  getValue: () => string
}

export function CodeEditor({
  value,
  language,
  className,
  ariaLabel,
  readOnly = true,
  onChange,
  handleRef,
}: {
  value: string
  language: string
  className?: string
  ariaLabel: string
  readOnly?: boolean
  onChange?: (value: string) => void
  handleRef?: React.RefObject<CodeEditorHandle | null>
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<MonacoApi.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof MonacoApi | null>(null)
  const config = useRef({ readOnly, ariaLabel, language })
  const changeHandler = useRef(onChange)
  const [ready, setReady] = useState(false)

  useMonacoTheme()

  // Keep the creation options and the change handler current without making the
  // editor itself re-create on every render.
  useEffect(() => {
    config.current = { readOnly, ariaLabel, language }
    changeHandler.current = onChange
  })

  useEffect(() => {
    let cancelled = false

    void import("@/lib/monaco").then(
      ({ monaco, EDITOR_OPTIONS, themeForDocument }) => {
        if (cancelled || !hostRef.current) {
          return
        }

        monacoRef.current = monaco
        monaco.editor.setTheme(themeForDocument())

        const editor = monaco.editor.create(hostRef.current, {
          ...EDITOR_OPTIONS,
          value: "",
          language: config.current.language,
          readOnly: config.current.readOnly,
          domReadOnly: config.current.readOnly,
          // The frame already carries the label; Monaco's own textarea needs a
          // distinct one so the two do not collide for assistive tech.
          ariaLabel: `${config.current.ariaLabel} editor`,
        })

        editor.onDidChangeModelContent(() => {
          if (!config.current.readOnly) {
            changeHandler.current?.(editor.getValue())
          }
        })

        editorRef.current = editor
        if (handleRef) {
          handleRef.current = { getValue: () => editor.getValue() }
        }
        setReady(true)
      }
    )

    return () => {
      cancelled = true
      editorRef.current?.dispose()
      editorRef.current = null
      if (handleRef) {
        handleRef.current = null
      }
    }
  }, [handleRef])

  useEffect(() => {
    const editor = editorRef.current
    const model = editor?.getModel()
    if (!ready || !editor || !model) {
      return
    }
    if (model.getValue() !== value) {
      editor.setValue(value)
    }
  }, [value, ready])

  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const model = editor?.getModel()
    if (!ready || !editor || !monaco || !model) {
      return
    }
    if (model.getLanguageId() !== language) {
      monaco.editor.setModelLanguage(model, language)
    }
  }, [language, ready])

  return (
    <EditorFrame
      ariaLabel={ariaLabel}
      language={language}
      className={className}
      hostRef={hostRef}
      ready={ready}
    />
  )
}

export function CodeDiff({
  original,
  modified,
  language,
  className,
  ariaLabel,
}: {
  original: string
  modified: string
  language: string
  className?: string
  ariaLabel: string
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const diffRef = useRef<MonacoApi.editor.IStandaloneDiffEditor | null>(null)
  const monacoRef = useRef<typeof MonacoApi | null>(null)
  const modelsRef = useRef<{
    original: MonacoApi.editor.ITextModel
    modified: MonacoApi.editor.ITextModel
  } | null>(null)
  const [ready, setReady] = useState(false)

  useMonacoTheme()

  useEffect(() => {
    let cancelled = false

    void import("@/lib/monaco").then(
      ({ monaco, EDITOR_OPTIONS, themeForDocument }) => {
        if (cancelled || !hostRef.current) {
          return
        }

        monacoRef.current = monaco
        monaco.editor.setTheme(themeForDocument())

        const diff = monaco.editor.createDiffEditor(hostRef.current, {
          ...EDITOR_OPTIONS,
          readOnly: true,
          originalEditable: false,
          ignoreTrimWhitespace: false,
          renderOverviewRuler: false,
        })

        diffRef.current = diff
        setReady(true)
      }
    )

    return () => {
      cancelled = true
      diffRef.current?.dispose()
      diffRef.current = null
      modelsRef.current?.original.dispose()
      modelsRef.current?.modified.dispose()
      modelsRef.current = null
    }
  }, [])

  useEffect(() => {
    const diff = diffRef.current
    const monaco = monacoRef.current
    if (!ready || !diff || !monaco) {
      return
    }

    const models = {
      original: monaco.editor.createModel(original, language),
      modified: monaco.editor.createModel(modified, language),
    }
    diff.setModel(models)

    const previous = modelsRef.current
    modelsRef.current = models
    previous?.original.dispose()
    previous?.modified.dispose()
  }, [original, modified, language, ready])

  return (
    <EditorFrame
      ariaLabel={ariaLabel}
      language={language}
      className={className}
      hostRef={hostRef}
      ready={ready}
    />
  )
}
