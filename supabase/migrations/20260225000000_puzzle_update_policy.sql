-- Allow authenticated users to update puzzles (needed for refreshing
-- clue data when the normalizer is fixed after initial upload).
create policy "Authenticated users can update puzzles"
  on puzzles for update using (auth.role() = 'authenticated');
