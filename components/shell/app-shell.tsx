'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import LeafyGreenProvider from '@leafygreen-ui/leafygreen-provider'
import { ToastProvider } from '@/components/shared/toast'
import { SideNav, SideNavGroup, SideNavItem } from '@leafygreen-ui/side-nav'
import Icon from '@leafygreen-ui/icon'
import IconButton from '@leafygreen-ui/icon-button'
import Badge from '@leafygreen-ui/badge'
import { Body } from '@leafygreen-ui/typography'
import { NAV } from '@/lib/navigation'
import { loadDemoState, useDemoLoaded, useDemoState } from '@/lib/demo/store'

const THEME_KEY = 'adh-theme'

export function AppShell({ children }: { children: ReactNode }) {
  const loaded = useDemoLoaded()
  const state = useDemoState()
  const pathname = usePathname()
  const router = useRouter()
  const [darkMode, setDarkMode] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    void loadDemoState()
    setDarkMode(window.localStorage.getItem(THEME_KEY) === 'dark')
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
  }, [darkMode])

  const needsSetup = loaded && !state.setup?.completed
  const onSetup = pathname === '/setup'

  useEffect(() => {
    if (needsSetup && !onSetup) router.replace('/setup')
  }, [needsSetup, onSetup, router])

  const toggleTheme = () => {
    const next = !darkMode
    setDarkMode(next)
    window.localStorage.setItem(THEME_KEY, next ? 'dark' : 'light')
  }

  return (
    <LeafyGreenProvider darkMode={darkMode}>
      <ToastProvider>
        {!loaded || (needsSetup && !onSetup) ? (
          <div className="flex min-h-screen items-center justify-center" role="status">
            <Body>Loading Atlas Document Hub...</Body>
          </div>
        ) : needsSetup ? (
          <main className="min-h-screen bg-background">{children}</main>
        ) : (
          <div className="flex min-h-screen">
            <SideNav
              aria-label="Atlas Document Hub"
              darkMode
              collapsed={collapsed}
              setCollapsed={setCollapsed}
              widthOverride={256}
              className="!sticky top-0 h-screen shrink-0"
            >
              <div className="flex items-center gap-2 px-4 pb-3 pt-4">
                <span className="h-6 w-1.5 rounded-sm bg-spring" aria-hidden="true" />
                <span className="text-sm font-semibold tracking-wide text-white">ATLAS DOCUMENT HUB</span>
              </div>
              {NAV.map((group) => (
                <SideNavGroup
                  key={group.header}
                  header={group.header}
                  glyph={<Icon glyph={group.glyph} />}
                  hasActiveItem={group.items.some((i) => i.href === pathname)}
                >
                  {group.items.map((item) => (
                    <SideNavItem key={item.href} as={Link} href={item.href} active={pathname === item.href}>
                      <span className="flex w-full items-center justify-between gap-2">
                        <span>{item.label}</span>
                        {!item.implemented && (
                          <Badge variant="darkgray" className="!h-4 !px-1.5 !text-[10px]">
                            Planned
                          </Badge>
                        )}
                      </span>
                    </SideNavItem>
                  ))}
                </SideNavGroup>
              ))}
            </SideNav>
            <div className="flex min-w-0 flex-1 flex-col bg-background">
              <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-surface px-6 py-2.5">
                <div className="flex items-center gap-3">
                  {state.setup?.mode === 'atlas' ? (
                    <>
                      <Badge variant="green">Atlas Mode</Badge>
                      <Body className="hidden md:block" baseFontSize={13}>
                        {state.setup?.organization} - data persisted in MongoDB Atlas (collections + GridFS)
                      </Body>
                    </>
                  ) : (
                    <>
                      <Badge variant="yellow">Demo Mode</Badge>
                      <Body className="hidden md:block" baseFontSize={13}>
                        {state.setup?.organization} - data persisted in this browser (IndexedDB) only
                      </Body>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Link href="/status" className="text-xs font-medium text-mdb-green underline-offset-2 hover:underline">
                    Implementation status
                  </Link>
                  <IconButton aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme}>
                    <Icon glyph={darkMode ? 'Sun' : 'Moon'} />
                  </IconButton>
                  <div className="flex items-center gap-2 border-l border-border pl-3">
                    <Icon glyph="Person" />
                    <Body baseFontSize={13}>{state.users[0]?.name}</Body>
                    <Badge variant="lightgray">{state.users[0]?.roles[0]}</Badge>
                  </div>
                </div>
              </header>
              <main className="flex-1 px-6 py-6">{children}</main>
            </div>
          </div>
        )}
      </ToastProvider>
    </LeafyGreenProvider>
  )
}
