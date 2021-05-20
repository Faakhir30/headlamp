import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import App from './App';

test('renders without crashing', async () => {
  const { getByText } = render(
    <React.Suspense fallback="Loading...">
      <App />
    </React.Suspense>
  );

  await waitFor(() => {
    expect(getByText(/Wait while fetching clusters/i)).toBeInTheDocument();
  });
});
