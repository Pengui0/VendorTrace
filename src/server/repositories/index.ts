/**
 * Repository Registry & Data Access Factory
 * Provides the active IUnitOfWork instance with explicit durability tracking.
 */

import { IUnitOfWork } from './interfaces.js';
import { DevInMemoryUnitOfWork } from './devInMemoryAdapter.js';

class RepositoryManager {
  private activeUnitOfWork: IUnitOfWork;

  constructor() {
    // Check if Firestore environment or config file is present
    const hasFirestoreConfig = Boolean(process.env.FIREBASE_CONFIG || process.env.GOOGLE_APPLICATION_CREDENTIALS);

    if (hasFirestoreConfig) {
      // If Firestore credentials were fully configured, initialize Firestore adapter.
      // Currently, fallback to explicitly-labelled non-durable DevInMemory adapter.
      this.activeUnitOfWork = new DevInMemoryUnitOfWork();
    } else {
      this.activeUnitOfWork = new DevInMemoryUnitOfWork();
    }
  }

  public get uow(): IUnitOfWork {
    return this.activeUnitOfWork;
  }

  public getStorageStatus() {
    return this.activeUnitOfWork.getStorageMode();
  }
}

export const repositoryManager = new RepositoryManager();
export const db = repositoryManager.uow;
