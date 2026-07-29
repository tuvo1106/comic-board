"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut, useSession } from "@/lib/auth-client";
import { AccountSettingsDialog } from "@/components/auth/AccountSettingsDialog";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { Download, Plus, Settings } from "@/components/ui/icons";
import { SearchBox } from "./SearchBox";

interface Props {
  search: string;
  onSearch: (value: string) => void;
  /** Apply a search term immediately, bypassing the debounce (suggestion picks). */
  onSearchCommit: (value: string) => void;
  onAdd: () => void;
}

export function TopBar({ search, onSearch, onSearchCommit, onAdd }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1800px] items-center gap-4 px-5 py-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-fg font-black">
            C
          </div>
          <h1 className="text-lg font-bold tracking-tight">Comic Board</h1>
        </div>

        <SearchBox value={search} onChange={onSearch} onCommit={onSearchCommit} />

        <div className="flex-1" />

        <button
          onClick={onAdd}
          className="inline-flex items-center gap-2 rounded-lg bg-accent py-2 pl-3 pr-3.5 text-sm font-semibold text-accent-fg shadow-sm transition hover:brightness-110 active:scale-95"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>

        <UserMenu />
      </div>
    </header>
  );
}

function UserMenu() {
  const { data } = useSession();
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const user = data?.user;
  const initial = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();

  return (
    <>
      <Menu
        align="right"
        widthClass="w-56"
        trigger={({ toggle }) => (
          <button
            onClick={toggle}
            className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-sm font-semibold text-fg ring-1 ring-border transition hover:ring-accent/50"
            title={user?.email ?? "Account"}
          >
            {initial}
          </button>
        )}
      >
        {(close) => (
          <>
            <div className="px-2.5 py-1.5">
              <p className="truncate text-sm font-medium text-fg">{user?.name || "Signed in"}</p>
              <p className="truncate text-xs text-muted">{user?.email}</p>
            </div>
            <div className="my-1 h-px bg-border" />
            <MenuItem
              icon={<Settings className="h-4 w-4" />}
              onClick={() => {
                close();
                setSettingsOpen(true);
              }}
            >
              Account settings
            </MenuItem>
            <MenuItem
              icon={<Download className="h-4 w-4" />}
              onClick={() => {
                close();
                // The response is Content-Disposition: attachment, so this
                // downloads the zip without navigating away from the board.
                window.location.href = "/api/export";
              }}
            >
              Export backup
            </MenuItem>
            <MenuItem
              onClick={async () => {
                close();
                await signOut();
                router.push("/login");
                router.refresh();
              }}
            >
              Sign out
            </MenuItem>
          </>
        )}
      </Menu>
      <AccountSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
