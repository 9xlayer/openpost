### Fixed

- Show the media library grid at the 400px thumbnail tier and the inspector and approval preview at the original image, so large previews are no longer stretched from a 150px square crop.
- Keep saved text-card images visible when a publication stores only sparse card settings, instead of losing them after a save.
- Clear the media picker grid when the workspace changes, so another workspace's media cannot be selected while the new list loads.
- Restore the Quick Cut cloud-conflict heading, so the notice is reachable by heading navigation again.
- Save edited attachment alt text on destination media rows that already exist in the native composer.
- Request the 400px tier for the native draft attachment thumbnails instead of each full original.
- Keep the media conversion limits out of the marketing tool route bundle, so tool pages no longer load the conversion engine before hydration.
- Render saved memes at 1080px so the composer and social feeds no longer upscale the 600px preview size; animated GIFs keep 600px to bound their size.
- Import the original Pixabay photo when available, then the 1920px full HD and 1280px large copies, and report the delivered file's dimensions and media type.
- Encode thumbnails as transparent PNG for uploads with alpha and serve the matching content type, so transparent images no longer get a black background.
- Stop stretching extension screenshots beyond their captured width.
- Show image tiles in the media picker at the 400px thumbnail tier instead of upscaling the 150px one.
