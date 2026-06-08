interface AgencyNoteInlineProps {
  value: string
  placeholder?: string
  onSave: (value: string) => void
}

export function AgencyNoteInline({ value, placeholder, onSave }: AgencyNoteInlineProps) {
  return (
    <input
      key={value}
      defaultValue={value}
      onBlur={(e) => onSave(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      className="input-field w-full text-[10px] py-1"
      placeholder={placeholder || 'Engagement note, KO name, vehicle access…'}
    />
  )
}