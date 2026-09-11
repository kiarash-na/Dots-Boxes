import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  trigger: ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onConfirm: () => void;
}

export default function ConfirmDialog({
  trigger,
  title,
  description,
  actionLabel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="max-w-xs rounded-none border-[#EEF0F5] p-8 text-center shadow-[0_24px_60px_-24px_rgba(16,19,26,0.35)]">
        <AlertDialogHeader className="text-center sm:text-center">
          <AlertDialogTitle className="text-[20px] font-extrabold tracking-[-0.03em] text-[#10131A]">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[13px] text-[#5A6070]">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2 flex-col gap-2 sm:flex-col">
          <AlertDialogAction
            onClick={onConfirm}
            className="w-full rounded-none bg-[#10131A] px-6 py-3 text-[15px] font-bold text-white hover:bg-[#10131A] hover:opacity-90"
          >
            {actionLabel}
          </AlertDialogAction>
          <AlertDialogCancel className="mt-0 w-full rounded-none border-0 px-6 py-3 text-[13px] font-semibold text-[#5A6070] shadow-none hover:bg-transparent hover:text-[#10131A]">
            Cancel
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
