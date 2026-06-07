import { MessageSquare } from 'lucide-react'
import { Button } from './Button'

interface AskCoPilotButtonProps {
  prompt: string
  label?: string
  onAsk: (prompt: string) => void
  title?: string
}

export function AskCoPilotButton({
  prompt,
  label = 'Ask',
  onAsk,
  title,
}: AskCoPilotButtonProps) {
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={() => onAsk(prompt)}
      title={title ?? `Ask co-pilot: ${prompt.slice(0, 80)}…`}
    >
      <MessageSquare className="w-3 h-3" />
      {label}
    </Button>
  )
}