//! Orchestrates the data folder location repository. Thin pass-through:
//! the interesting validation (filesystem/SQLite checks) lives in the
//! repository implementation, since it's inherently an infra concern.

use std::path::PathBuf;

use crate::domain::data_folder_location::{DataFolderLocationError, DataFolderLocationRepository};

pub fn get_current_folder(
    repo: &dyn DataFolderLocationRepository,
) -> Result<Option<PathBuf>, DataFolderLocationError> {
    repo.get_current_folder()
}

pub fn set_default_folder(
    repo: &dyn DataFolderLocationRepository,
) -> Result<PathBuf, DataFolderLocationError> {
    repo.set_default_folder()
}

pub fn open_folder(
    repo: &dyn DataFolderLocationRepository,
    path: PathBuf,
) -> Result<PathBuf, DataFolderLocationError> {
    repo.open_folder(path)
}

pub fn move_folder(
    repo: &dyn DataFolderLocationRepository,
    destination: PathBuf,
) -> Result<PathBuf, DataFolderLocationError> {
    repo.move_folder(destination)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Default)]
    struct FakeRepository {
        folder: RefCell<Option<PathBuf>>,
    }

    impl DataFolderLocationRepository for FakeRepository {
        fn get_current_folder(&self) -> Result<Option<PathBuf>, DataFolderLocationError> {
            Ok(self.folder.borrow().clone())
        }

        fn set_default_folder(&self) -> Result<PathBuf, DataFolderLocationError> {
            let folder = PathBuf::from("/default/saves");
            *self.folder.borrow_mut() = Some(folder.clone());
            Ok(folder)
        }

        fn open_folder(&self, path: PathBuf) -> Result<PathBuf, DataFolderLocationError> {
            *self.folder.borrow_mut() = Some(path.clone());
            Ok(path)
        }

        fn move_folder(&self, destination: PathBuf) -> Result<PathBuf, DataFolderLocationError> {
            if self.folder.borrow().is_none() {
                return Err(DataFolderLocationError::NoPointerSet);
            }
            *self.folder.borrow_mut() = Some(destination.clone());
            Ok(destination)
        }
    }

    #[test]
    fn get_current_folder_delegates_to_the_repository() {
        let repo = FakeRepository::default();
        assert_eq!(get_current_folder(&repo).unwrap(), None);

        repo.open_folder(PathBuf::from("/somewhere")).unwrap();
        assert_eq!(
            get_current_folder(&repo).unwrap(),
            Some(PathBuf::from("/somewhere"))
        );
    }

    #[test]
    fn set_default_folder_delegates_to_the_repository() {
        let repo = FakeRepository::default();
        let folder = set_default_folder(&repo).unwrap();
        assert_eq!(folder, PathBuf::from("/default/saves"));
        assert_eq!(get_current_folder(&repo).unwrap(), Some(folder));
    }

    #[test]
    fn open_folder_delegates_to_the_repository() {
        let repo = FakeRepository::default();
        let folder = open_folder(&repo, PathBuf::from("/chosen")).unwrap();
        assert_eq!(folder, PathBuf::from("/chosen"));
    }

    #[test]
    fn move_folder_propagates_repository_errors() {
        let repo = FakeRepository::default();
        let err = move_folder(&repo, PathBuf::from("/new")).unwrap_err();
        assert_eq!(err, DataFolderLocationError::NoPointerSet);
    }

    #[test]
    fn move_folder_delegates_to_the_repository_once_set() {
        let repo = FakeRepository::default();
        set_default_folder(&repo).unwrap();
        let folder = move_folder(&repo, PathBuf::from("/new")).unwrap();
        assert_eq!(folder, PathBuf::from("/new"));
    }
}
