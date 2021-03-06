(function() {
  'use strict';

  angular
    .module('bd.app')
    .controller('ProjectController', ProjectController)
    .config(function($locationProvider) {
      $locationProvider.html5Mode({
        enabled: true,
        requireBase: false,
        rewriteLinks: true
      });
    });


  function ProjectController($scope, $timeout, $http, $window, $location, $mdToast, $mdDialog,
        projectManager, workspace, ReadOnlyStore, ProjectLocalStore, dataUrl) {

    function showNotification(htmlContent) {
      $mdToast.show({
        template:
          '<md-toast>\
            <div class="md-toast-content">{0}</div>\
          </md-toast>'.format(htmlContent),
        position: 'bottom right',
        hideDelay: 2500
      });
    }

    function showSaveNotification(sectionName) {
      showNotification('<span>Section <b>{0}</b> was saved</span>'.format(sectionName));
    }


    function AddTrackController($scope, projectManager, $mdDialog) {
      $scope.close = $mdDialog.hide;
      $scope.instruments = [
        {
          name: 'Bass',
          type: 'bass',
          strings: 'EADG',
        }, {
          name: 'Drums',
          kit: 'Drums',
          type: 'drums'
        }, {
          name: 'Percussions',
          kit: 'Percussions',
          type: 'drums',
          icon: 'percussions'
        }
      ];
      $scope.addTrack = function(trackInfo) {
        projectManager.addTrack(trackInfo);
        $mdDialog.hide();
      }
    }
    $scope.addTrackDialog = function(evt) {

      $mdDialog.show({
        templateUrl: 'views/editor/new_track.html',
        controller: AddTrackController,
        autoWrap: false,
        clickOutsideToClose: true
        // targetEvent: evt
      });
    };

    $scope.removeTrack = function(trackId) {
      console.log('remove track: '+trackId);

      var track = projectManager.project.tracksMap[trackId];
      var nextSelected = projectManager.project.tracks.find(function(t) {
        return t.type === track.type && t.id !== trackId;
      });
      if (nextSelected) {
        $scope.ui.selectTrack(nextSelected.id);
        projectManager.removeTrack(trackId);
      } else {
        $mdDialog.show(
          $mdDialog.alert()
            .title("Warning")
            .textContent("Can't remove this track, it's the last track of its instrument kind!")
            .theme(' ')
            .ok("Close")
        );
      }
    }

    $scope.newProject = function() {
      if (projectManager.store.readOnly) {
        projectManager.store = new ProjectLocalStore()
        // $window.history.pushState(null, null, '?');
        $location.hash('');
      }
      document.title = "New Project";
      workspace.bassSection = null;
      workspace.drumSection = null;
      $scope.project = projectManager.createProject([
        {
          type: 'bass',
          name: 'Bass',
          strings: 'EADG',
          tuning: [0, 0, 0, 0]
        }, {
          type: 'drums',
          kit: 'Drums',
          name: 'Drums'
        }, {
          type: 'drums',
          kit: 'Percussions',
          name: 'Percussions'
        }
      ]);
      var section = projectManager.createSection();
      workspace.selectedSectionId = section.id;
      workspace.section = section;
      projectManager.loadSection(workspace.selectedSectionId);
    };

    $scope.loadProject = function(projectId) {
      $scope.project = projectManager.loadProject(projectId);
      document.title = $scope.project.name;
      workspace.selectedSectionId = $scope.project.sections[0].id;
      projectManager.loadSection(workspace.selectedSectionId);
      workspace.section = projectManager.section;
    };

    function OpenProjectController($scope, $mdDialog, projectManager) {
      $scope.projects = projectManager.store.projectsList();
      if (projectManager.store.project) {
        $scope.openedProjectId = projectManager.store.project.id;
      }
      // $scope.currentProjectId = projectManager.store.project.id;
      $scope.close = $mdDialog.hide;
      $scope.deleteProject = function(projectId) {
        projectManager.store.deleteProject(projectId);
        $scope.projects = projectManager.store.projectsList();
      }
      $scope.openProject = function(projectId) {
        $mdDialog.hide(projectId);
      }
      $scope.importProjectFile = function(file) {
        var projectName = file.filename.replace('.json', '');
        console.log('Importing project: '+projectName);
        var reader = new ReadOnlyStore(JSON.parse(file.content));
        var project = reader.getProject();
        // assign playlists ids
        project.playlists.forEach(function(playlist, index) {
          playlist.id = index + 1;
        });

        var writer = new ProjectLocalStore();
        writer.createProject(projectName);
        project.id = writer.project.id;
        project.name = projectName;
        writer.project = project;
        writer.saveProjectConfig(project.tracks, project.sections);
        project.sections.forEach(function(sectionInfo) {
          var section = reader.getSection(sectionInfo.id);
          writer.saveSection(section.id, section.name, JSON.stringify(section));
        });
        writer.savePlaylists(project.playlists);

        $scope.projects.push({
          id: project.id,
          name: file.filename
        });
        // $scope.projects = projectManager.store.projectsList();
      }
    }

    $scope.openProject = function() {
      $mdDialog.show({
        templateUrl: 'views/open_project.html',
        controller: OpenProjectController,
        autoWrap: false,
        clickOutsideToClose: false
      }).then(function(projectId) {
        if (projectId) {
          $scope.loadProject(projectId);
        }
      });
    };

    $scope.newSection = function() {
      var section = projectManager.createSection(projectManager.section);
      section.name = 'New';
      workspace.selectedSectionId = section.id;
      projectManager.loadSection(workspace.selectedSectionId);
    };

    $scope.saveSection = function() {
      if (!workspace.section.name) {
        return;
      }
      if (!projectManager.project.name) {
        // Project will be saved into the browser's local storage
        var confirm = $mdDialog.prompt()
          .title('Saving Project')
          .textContent('Please enter project name:')
          .placeholder('Name')
          .ariaLabel('Name')
          .theme(' ')
          .ok('Save')
          .cancel('Cancel');

        $mdDialog.show(confirm).then(function(projectName) {
          if (projectName) {
            document.title = projectName;
            projectManager.project.name = projectName;
            projectManager.saveSection();
            showSaveNotification(workspace.section.name);
          }
        });

      } else {
        projectManager.saveSection();
        showSaveNotification(workspace.section.name);
      }
    }

    $scope.saveAsSection = function() {
      projectManager.saveAsNewSection();
      workspace.section = projectManager.section;
      workspace.selectedSectionId = workspace.section.id;
    };

    $scope.deleteSection = function() {
      projectManager.deleteSection(workspace.selectedSectionId);

      // select another section or create a new section
      if (projectManager.project.sections.length > 0) {
        workspace.selectedSectionId = projectManager.project.sections[0].id;
      } else {
        workspace.selectedSectionId = projectManager.createSection().id;
      }
      projectManager.loadSection(workspace.selectedSectionId);
    };


    $scope.newPlaylist = function() {
      var playlist = projectManager.createPlaylist();
      projectManager.loadPlaylist(playlist.id);
    };

    $scope.savePlaylists = function() {
      if (workspace.playlist.name) {
        projectManager.savePlaylists();
        showNotification('<span>Playlists was saved</span>');
      }
    };

    $scope.deletePlaylist = function() {
      var deletedPlaylistName = workspace.playlist.name;
      projectManager.deletePlaylist(workspace.playlist.id);
      if (!projectManager.store.readOnly) {
        projectManager.savePlaylists();
      }
      showNotification('<span>Playlist <b>{0}</b> was deleted</span>'.format(deletedPlaylistName));
      if (projectManager.project.playlists.length) {
        projectManager.loadPlaylist(projectManager.project.playlists[0].id);
      }
    };

    $scope.itemReorderHandler = function(event, dragItemId, dropItemId, list) {
      var dragItemIndex = list.findIndex(function(item) {
        return item.id === dragItemId;
      });
      var dragItem = list.splice(dragItemIndex, 1)[0];
      var dropItemIndex = list.findIndex(function(item) {
        return item.id === dropItemId;
      });
      list.splice(dropItemIndex, 0, dragItem);
    }

    var projectParam = $location.hash();
    if (projectParam) {
      $http.get(dataUrl+projectParam+'.json').then(function(response) {
        projectManager.store = new ReadOnlyStore(response.data);
        $scope.project = projectManager.loadProject(1);
        workspace.selectedSectionId = $scope.project.sections[0].id;
        projectManager.loadSection(workspace.selectedSectionId);
      });
    } else {
      if (projectManager.store.projects.length) {
        // open last project
        var startupProject = projectManager.store.projects[0];
        try {
          $scope.loadProject(startupProject.id);
        } catch (ex) {
          var alert = $mdDialog.alert()
            .title('Warning')
            .textContent(
              'Failed to open latest project.'
            )
            .theme(' ')
            .ok('Close');

          $mdDialog.show(alert);
          $scope.newProject();
        }
      } else {
        $scope.newProject();
      }
    }

    $scope.exportProject = function() {
      var data = projectManager.store._projectData();
      console.log(data);
      var blob = new Blob(
        // [JSON.stringify(data, null, 4)],
        [JSON.stringify(data)],
        {type: "application/json;charset=utf-8"}
      );
      saveAs(blob, projectManager.project.name+'.json');
    };

    workspace.importProject = function() {
      $timeout(function() {
        var projectName = $location.path();
        console.log('Importing project: '+projectName)
        var sections = projectManager.project.sections.map(function(sectionInfo) {
          return projectManager.getSection(sectionInfo.id);
        });
        $scope.newProject();
        sections.forEach(projectManager.importSection, projectManager);
        projectManager.loadSection(sections[0].id);
        workspace.selectedSectionId = projectManager.section.id;
      });
    };

    workspace._import = function(section, srcBar, srcBeat, destBar, destBeat, count) {
      var barIndex = srcBar;
      var beatIndex = srcBeat;
      // var tracks = projectManager.project.tracks
      var data = {};
      for (var trackId in section.tracks) {
        data[trackId] = [];
      }
      var destBarIndex = destBar;
      var destBeatIndex = destBeat;
      while (count--) {
        for (var trackId in section.tracks) {
          var track = section.tracks[trackId];
          var beat = angular.copy(track.beat(barIndex, beatIndex));
          beat.bar = destBarIndex;
          beat.beat = destBeatIndex;
          data[trackId].push(beat);
        }
        beatIndex++;
        if (beatIndex > section.timeSignature.top) {
          beatIndex = 1;
          barIndex++;
        }
        destBeatIndex++;
        if (destBeatIndex > section.timeSignature.top) {
          destBeatIndex = 1;
          destBarIndex++;
        }
      }
      // import part
      for (var trackId in workspace.section.tracks) {
        var trackSection = workspace.section.tracks[trackId];
        if (trackSection.loadBeats) {
          console.log('importing track beats: '+trackId);
          trackSection.loadBeats(data[trackId]);
        }
      }
    };

    workspace.importBeats = function(sectionId, srcBar, srcBeat, destBar, destBeat, count) {
      var section = projectManager.getSection(sectionId);
      workspace._import(section, srcBar, srcBeat, destBar, destBeat, count);
    };

    workspace.importBars = function(sectionId, srcBar, destBar, count) {
      var section = projectManager.getSection(sectionId);
      workspace._import(section, srcBar, 1, destBar, 1, count * section.timeSignature.top);
    };

    workspace.exportSection = function() {
      if (workspace.section.name) {
        var blob = new Blob(
          [projectManager.serializeSection(projectManager.section)],
          {type: "application/json;charset=utf-8"}
        );
        saveAs(blob, projectManager.section.name+'.json');
      }
    }

    $scope.importSectionFromFile = function(file) {
      var section = projectManager.loadSectionData(JSON.parse(file.content));
      projectManager.importSection(section);
      projectManager.loadSection(section.id);
    }

  }
})();
