'use client';

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { Modal } from '@heroui/react/modal';
import { Tooltip } from '@heroui/react/tooltip';
import { ChevronsLeft, ChevronsRight, Menu, X } from 'lucide-react';
import { SiteLogo } from '../site/logo';
import { ThemeSelector } from '../site/theme-selector';

export type ShellNavigationItem = {
  href: string;
  label: string;
  icon?: ReactNode;
  unavailable?: boolean;
  section?: string;
  activePaths?: readonly string[];
};

/** 未开放入口不提供链接；真实入口的鉴权仍在服务端执行。 */
export function AdminShell({
  name,
  description,
  logoUrl,
  navigation,
  user,
  children,
  footer,
  initialSidebarCollapsed = false,
}: {
  name: string;
  description?: string;
  logoUrl?: string | null;
  navigation: readonly ShellNavigationItem[];
  user: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  initialSidebarCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(initialSidebarCollapsed);
  const navigationId = useId();
  const mainRef = useRef<HTMLElement>(null);
  const brand = logoUrl ? (
    <SiteLogo url={logoUrl} name={name} className="h-12 w-24" />
  ) : (
    name
  );
  const current = navigation
    .filter(
      ({ href, unavailable, activePaths }) =>
        !unavailable &&
        (pathname === href ||
          activePaths?.includes(pathname) ||
          (href !== '/' && pathname.startsWith(`${href}/`))),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia('(min-width: 1200px)');
    const closeOnResize = () => {
      if (desktop.matches) {
        setOpen(false);
      }
    };
    desktop.addEventListener('change', closeOnResize);
    return () => desktop.removeEventListener('change', closeOnResize);
  }, [open]);

  // 等菜单实际移除后再聚焦，避免关闭动画中的焦点范围把焦点拉回隐藏按钮。
  const menuRef = useCallback((node: HTMLElement | null) => {
    if (node) return;
    requestAnimationFrame(() => {
      if (window.matchMedia('(min-width: 1200px)').matches) {
        document
          .querySelector<HTMLElement>(
            '.shell-navigation [aria-current="page"], .shell-navigation .shell-brand',
          )
          ?.focus();
      }
    });
  }, []);

  const links = (close?: () => void) =>
    navigation.map((item) => (
      <Fragment key={item.href}>
        {item.section ? (
          <p className="shell-nav-section text-[11px] leading-normal">
            {item.section}
          </p>
        ) : null}
        <NavigationLink
          item={item}
          current={current === item.href}
          compact={collapsed && !close}
          onNavigate={close}
        />
      </Fragment>
    ));

  return (
    <div className="admin-shell">
      <Link
        href="#main-content"
        className="skip-link"
        onPress={() => mainRef.current?.focus()}
      >
        跳到主要内容
      </Link>
      <aside
        className="shell-navigation group/sidebar"
        data-collapsed={collapsed}
        aria-label="后台侧栏"
      >
        <div className="flex h-18 shrink-0 items-center gap-[31px] group-data-[collapsed=true]/sidebar:justify-center">
          <Link
            href="/"
            className="shell-brand block min-w-0 truncate"
            aria-label={`${name} 首页`}
          >
            {brand}
          </Link>
          <Tooltip>
            <Button
              isIconOnly
              variant="ghost"
              className="size-11 shrink-0 rounded-lg p-0"
              aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
              aria-expanded={!collapsed}
              aria-controls={navigationId}
              onPress={() => {
                const next = !collapsed;
                document.cookie = `ariso.sidebar-collapsed=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
                setCollapsed(next);
              }}
            >
              {collapsed ? (
                <ChevronsRight size={18} aria-hidden />
              ) : (
                <ChevronsLeft size={18} aria-hidden />
              )}
            </Button>
            <Tooltip.Content placement="right">
              {collapsed ? '展开侧栏' : '收起侧栏'}
            </Tooltip.Content>
          </Tooltip>
        </div>
        {description ? (
          <p className="shell-description">{description}</p>
        ) : null}
        <nav id={navigationId} aria-label="后台导航">
          {links()}
        </nav>
        <div className="shell-user">{user}</div>
      </aside>
      <header className="shell-mobile-header">
        <Link href="/" className="shell-brand" aria-label={`${name} 首页`}>
          {brand}
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeSelector />
          <Modal isOpen={open} onOpenChange={setOpen}>
            <Button
              isIconOnly
              variant="ghost"
              aria-label="菜单"
              className="size-11 shrink-0 rounded-lg p-0 [--button-bg-hover:transparent]"
            >
              <Menu size={20} aria-hidden />
            </Button>
            <Modal.Backdrop>
              <Modal.Container size="full">
                <Modal.Dialog aria-label="导航菜单" className="shell-menu">
                  <Modal.Header className="shell-menu-header">
                    <Modal.Heading className="shell-brand">
                      {brand}
                    </Modal.Heading>
                    <Button
                      slot="close"
                      isIconOnly
                      variant="ghost"
                      aria-label="关闭"
                      className="size-11 shrink-0 rounded-lg p-0 [--button-bg-hover:transparent]"
                    >
                      <X size={20} aria-hidden />
                    </Button>
                  </Modal.Header>
                  {description ? (
                    <p className="shell-description">{description}</p>
                  ) : null}
                  <Modal.Body className="shell-menu-body">
                    <nav ref={menuRef} aria-label="后台导航">
                      {links(() => setOpen(false))}
                    </nav>
                  </Modal.Body>
                  <Modal.Footer className="shell-menu-user">
                    {user}
                  </Modal.Footer>
                </Modal.Dialog>
              </Modal.Container>
            </Modal.Backdrop>
          </Modal>
        </div>
      </header>
      <div className="shell-workspace">
        <header className="shell-toolbar">
          <ThemeSelector />
        </header>
        <main
          ref={mainRef}
          id="main-content"
          tabIndex={-1}
          className="shell-content"
        >
          {children}
        </main>
        {footer ? <footer className="shell-footer">{footer}</footer> : null}
      </div>
    </div>
  );
}

function NavigationLink({
  item: { href, label, icon, unavailable },
  current,
  compact,
  onNavigate,
}: {
  item: ShellNavigationItem;
  current: boolean;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const name = unavailable ? `${label}，尚未开放` : label;
  const linkProps = {
    href: unavailable ? undefined : href,
    isDisabled: unavailable,
    'aria-label': name,
    'aria-current': current ? ('page' as const) : undefined,
    onPress: onNavigate,
  };
  const content = (
    <>
      {icon ? (
        <span className="shell-nav-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="shell-nav-label whitespace-nowrap">{label}</span>
      {unavailable ? (
        <span className="shell-nav-unavailable ml-auto whitespace-nowrap text-[10px]">
          尚未开放
        </span>
      ) : null}
    </>
  );
  return (
    <Tooltip isDisabled={!compact}>
      {unavailable ? (
        <Tooltip.Trigger
          className="block w-full rounded-xl"
          role="group"
          tabIndex={compact ? 0 : -1}
          aria-label={name}
        >
          <Link {...linkProps} className="shell-nav-link">
            {content}
          </Link>
        </Tooltip.Trigger>
      ) : (
        <Link {...linkProps} className="shell-nav-link">
          {content}
        </Link>
      )}
      <Tooltip.Content placement="right">{name}</Tooltip.Content>
    </Tooltip>
  );
}
