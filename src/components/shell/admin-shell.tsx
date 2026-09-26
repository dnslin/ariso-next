'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@heroui/react/button';
import { Link } from '@heroui/react/link';
import { Modal } from '@heroui/react/modal';

export type ShellNavigationItem = {
  href: string;
  label: string;
  icon?: ReactNode;
};

/** 路由组合方仅传入已经实现且当前用户可访问的入口；鉴权仍在服务端执行。 */
export function AdminShell({
  name,
  description,
  navigation,
  user,
  children,
  footer,
}: {
  name: string;
  description?: string;
  navigation: readonly ShellNavigationItem[];
  user: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = navigation
    .filter(
      ({ href }) =>
        pathname === href || (href !== '/' && pathname.startsWith(`${href}/`)),
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
    navigation.map(({ href, label, icon }) => (
      <Link
        key={href}
        href={href}
        aria-current={current === href ? 'page' : undefined}
        className="shell-nav-link"
        onPress={close}
      >
        {icon ? (
          <span className="shell-nav-icon" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {label}
      </Link>
    ));

  return (
    <div className="admin-shell">
      <Link href="#main-content" className="skip-link">
        跳到主要内容
      </Link>
      <aside className="shell-navigation" aria-label="后台侧栏">
        <Link href="/" className="shell-brand" aria-label={`${name} 首页`}>
          {name}
        </Link>
        {description ? (
          <p className="shell-description">{description}</p>
        ) : null}
        <nav aria-label="后台导航">{links()}</nav>
        <div className="shell-user">{user}</div>
      </aside>
      <header className="shell-mobile-header">
        <Link href="/" className="shell-brand" aria-label={`${name} 首页`}>
          {name}
        </Link>
        <Modal isOpen={open} onOpenChange={setOpen}>
          <Button variant="tertiary" className="h-11 min-w-16 rounded-full">
            菜单
          </Button>
          <Modal.Backdrop>
            <Modal.Container size="full">
              <Modal.Dialog aria-label="导航菜单" className="shell-menu">
                <Modal.Header className="shell-menu-header">
                  <Modal.Heading className="shell-brand">{name}</Modal.Heading>
                  <Button slot="close" variant="tertiary">
                    关闭
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
                <Modal.Footer className="shell-menu-user">{user}</Modal.Footer>
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      </header>
      <div className="shell-workspace">
        <main id="main-content" tabIndex={-1} className="shell-content">
          {children}
        </main>
        {footer ? <footer className="shell-footer">{footer}</footer> : null}
      </div>
    </div>
  );
}
