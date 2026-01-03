'use client';

interface LoaderProps {
  size?: 'sm' | 'md' | 'lg';
  fullScreen?: boolean;
  message?: string;
  overlay?: boolean;
}

export default function Loader({ size = 'md', fullScreen = false, message, overlay = false }: LoaderProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-4'
  };

  const spinner = (
    <div className={`loader-spinner ${sizeClasses[size]} border-gray-200 border-t-blue-600 rounded-full`} />
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white bg-opacity-90 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="text-center">
          {spinner}
          {message && (
            <p className="mt-4 text-gray-600 text-sm font-medium">{message}</p>
          )}
        </div>
      </div>
    );
  }

  if (overlay) {
    return (
      <div className="absolute inset-0 bg-white bg-opacity-75 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
        <div className="text-center">
          {spinner}
          {message && (
            <p className="mt-4 text-gray-600 text-sm font-medium">{message}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center">
      <div className="text-center">
        {spinner}
        {message && (
          <p className="mt-2 text-gray-600 text-sm font-medium">{message}</p>
        )}
      </div>
    </div>
  );
}
