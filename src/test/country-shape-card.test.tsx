import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import CountryShapeCard from '@/components/CountryShapeCard';

describe('CountryShapeCard', () => {
  it('expands the country shape on hover instead of relying on the globe panel', async () => {
    render(
      <CountryShapeCard
        countryName="Germany"
        locatorMapUrl="https://commons.wikimedia.org/wiki/Special:FilePath/Germany_locator_map.svg"
      />,
    );

    expect(screen.getByText('Hover to expand')).toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByLabelText('Focus Germany country shape'));

    await waitFor(() => {
      expect(screen.getByLabelText('Expanded Germany country shape')).toBeInTheDocument();
    });

    fireEvent.mouseLeave(screen.getByLabelText('Expanded Germany country shape panel'));

    await waitFor(() => {
      expect(screen.queryByLabelText('Expanded Germany country shape')).not.toBeInTheDocument();
    });
  });
});
