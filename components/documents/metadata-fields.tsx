'use client'

import TextInput from '@leafygreen-ui/text-input'
import TextArea from '@leafygreen-ui/text-area'
import { Option, Select } from '@leafygreen-ui/select'
import { CLASSIFICATIONS, DEPARTMENTS, DOCUMENT_TYPES, type Classification, type Department, type DocumentType } from '@/lib/domain/types'

export interface MetadataDraft {
  title: string
  description: string
  department: Department
  documentType: DocumentType
  classification: Classification
  tags: string
}

export function parseTags(raw: string) {
  return Array.from(new Set(raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)))
}

export function MetadataFields({
  value,
  onChange,
  disabled,
  titleError,
}: {
  value: MetadataDraft
  onChange: (next: MetadataDraft) => void
  disabled?: boolean
  titleError?: string
}) {
  const set = <K extends keyof MetadataDraft>(key: K, v: MetadataDraft[K]) => onChange({ ...value, [key]: v })
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <TextInput
          label="Title"
          value={value.title}
          disabled={disabled}
          onChange={(e) => set('title', e.target.value)}
          state={titleError ? 'error' : 'none'}
          errorMessage={titleError}
        />
      </div>
      <div className="md:col-span-2">
        <TextArea label="Description" value={value.description} disabled={disabled} onChange={(e) => set('description', e.target.value)} />
      </div>
      <Select label="Department" value={value.department} disabled={disabled} onChange={(v) => set('department', v as Department)}>
        {DEPARTMENTS.map((d) => (
          <Option key={d} value={d}>
            {d}
          </Option>
        ))}
      </Select>
      <Select label="Document type" value={value.documentType} disabled={disabled} onChange={(v) => set('documentType', v as DocumentType)}>
        {DOCUMENT_TYPES.map((d) => (
          <Option key={d} value={d}>
            {d}
          </Option>
        ))}
      </Select>
      <Select
        label="Classification"
        description="Confidential and Restricted narrow access to the owning department."
        value={value.classification}
        disabled={disabled}
        onChange={(v) => set('classification', v as Classification)}
      >
        {CLASSIFICATIONS.map((d) => (
          <Option key={d} value={d}>
            {d}
          </Option>
        ))}
      </Select>
      <TextInput
        label="Tags"
        description="Comma separated"
        value={value.tags}
        disabled={disabled}
        onChange={(e) => set('tags', e.target.value)}
      />
    </div>
  )
}
