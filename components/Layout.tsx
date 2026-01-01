
import React, { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-50 bg-opacity-80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-indigo-200 shadow-lg">
              T
            </div>
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">Tulisan Tangan Punya Cerita</h1>
          </div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">
        {children}
      </main>
      <footer className="border-t border-slate-100 bg-white py-8 mt-12">
        <div className="max-w-5xl mx-auto px-6 text-center text-slate-400 text-sm">
          <p>&copy; {new Date().getFullYear()} Tulisan Tangan Punya Cerita. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};
