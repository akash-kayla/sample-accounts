import { Egg, Heart } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { todayISO } from '../lib/dates';
import { SECRET_DOB } from '../lib/love';
import { DatePicker } from './DatePicker';
import { Button, IconButton, Modal } from './ui';

/** Little egg on the dashboard — the right date of birth unlocks /for-you. */
export function LoveEgg() {
  const nav = useNavigate();
  const today = todayISO();
  const [open, setOpen] = useState(false);
  const [dob, setDob] = useState(today);
  const [wrong, setWrong] = useState(0);

  const close = () => {
    setOpen(false);
    setDob(today);
    setWrong(0);
  };
  const unlock = () => {
    if (dob !== SECRET_DOB) {
      setWrong((w) => w + 1);
      return;
    }
    close();
    nav('/for-you', { state: { unlocked: true } });
  };

  return (
    <>
      <IconButton label="Something hidden…" onClick={() => setOpen(true)} className="text-muted hover:text-pink-500">
        <Egg className="size-5" />
      </IconButton>
      <Modal
        open={open}
        onClose={close}
        size="sm"
        title="🥚 A little secret"
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="dark" icon={<Heart className="size-4" />} onClick={unlock}>
              Unlock
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">This one is only for someone special. What’s your date of birth?</p>
        <div className="mt-4">
          <DatePicker
            label="Date of birth"
            value={dob}
            max={today}
            fromYear={1960}
            onChange={(v) => {
              setDob(v);
              setWrong(0);
            }}
          />
        </div>
        {wrong > 0 && (
          <p key={wrong} className="animate-shake mt-2 text-sm font-medium text-expense">
            Hmm, that’s not the one 🙂 Try again.
          </p>
        )}
      </Modal>
    </>
  );
}
