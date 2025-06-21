import { createApp } from 'trafficwork-framework';

/**
 * Start the application
 */
async function startServer() {
  try {
    // Create and initialize the app
    const app = await createApp();
    
    // Start the server
    await app.start();
    
    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      await app.shutdown();
      process.exit(0);
    });
    
    process.on('SIGINT', async () => {
      await app.shutdown();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
